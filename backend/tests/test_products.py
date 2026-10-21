"""Tests des produits (product_service) et de la configuration associée
(config_service : catégories / sous-catégories / emplacements) : CRUD,
quantités, lots FEFO, sous-catégorie à la volée, validation."""

# pylint: disable=redefined-outer-name

import pytest


@pytest.fixture
def h(env):
    """En-têtes d'une utilisatrice active (foyer personnel)."""
    user, _ = env.make_user("alice")
    return env.headers(user)


def _post(env, h, path, payload):
    response = env.client.post(path, json=payload, headers=h)
    assert response.status_code == 200, response.text
    return response.json()


# ==================== CRUD / VALIDATION ====================

def test_create_and_get_product_with_resolved_names(env, h):
    cat = _post(env, h, "/api/categories", {"name": "Épicerie"})
    loc = _post(env, h, "/api/locations", {"name": "Placard"})
    product = _post(env, h, "/api/products", {
        "name": "Café ☕ 日本", "quantity": 2, "category_id": cat["id"], "location_id": loc["id"], "price": 3.5,
    })
    fetched = env.client.get(f"/api/products/{product['id']}", headers=h).json()
    assert fetched["category_name"] == "Épicerie"
    assert fetched["location_name"] == "Placard"
    assert fetched["name"] == "Café ☕ 日本"


def test_create_missing_name_422(env, h):
    assert env.client.post("/api/products", json={"quantity": 1}, headers=h).status_code == 422


@pytest.mark.parametrize("field", ["category_id", "location_id", "sub_category_id"])
def test_create_unknown_ref_400(env, h, field):
    response = env.client.post("/api/products", json={"name": "X", field: "inexistant"}, headers=h)
    assert response.status_code == 400


@pytest.mark.xfail(strict=True, reason="BUG : quantité négative acceptée à la création (schemas.ProductBase.quantity sans ge=0)")
def test_create_negative_quantity_rejected(env, h):
    response = env.client.post("/api/products", json={"name": "X", "quantity": -5}, headers=h)
    assert response.status_code in (400, 422)


@pytest.mark.xfail(strict=True, reason="BUG : nom vide accepté (schemas.ProductBase.name sans min_length)")
def test_create_empty_name_rejected(env, h):
    response = env.client.post("/api/products", json={"name": ""}, headers=h)
    assert response.status_code in (400, 422)


@pytest.mark.xfail(
    strict=True,
    reason="BUG : PUT /products/{id} avec name/quantity/min_quantity = null -> setattr(None) sur colonne "
           "NOT NULL -> IntegrityError -> 500 (product_service.py:307-308, exclude_unset sans filtrage "
           "des champs obligatoires)",
)
@pytest.mark.parametrize("field", ["name", "quantity", "min_quantity"])
def test_update_null_required_field_does_not_500(env, h, field):
    product = _post(env, h, "/api/products", {"name": "Lait", "quantity": 2})
    response = env.client.put(f"/api/products/{product['id']}", json={field: None}, headers=h)
    assert response.status_code < 500, response.text


def test_update_can_clear_optional_fields(env, h):
    cat = _post(env, h, "/api/categories", {"name": "Frais"})
    product = _post(env, h, "/api/products", {"name": "Lait", "price": 1.2, "category_id": cat["id"]})
    updated = env.client.put(
        f"/api/products/{product['id']}", json={"price": None, "category_id": None}, headers=h
    ).json()
    assert updated["price"] is None
    assert updated["category_id"] is None


def test_unknown_product_404(env, h):
    for method, path in [("get", "/api/products/x"), ("put", "/api/products/x"),
                         ("patch", "/api/products/x/quantity?delta=1"), ("delete", "/api/products/x")]:
        kwargs = {"json": {"name": "y"}} if method == "put" else {}
        assert getattr(env.client, method)(path, headers=h, **kwargs).status_code == 404, path


# ==================== QUANTITÉS / LOTS ====================

def test_quantity_never_goes_below_zero(env, h):
    product = _post(env, h, "/api/products", {"name": "Lait", "quantity": 2})
    response = env.client.patch(f"/api/products/{product['id']}/quantity?delta=-10", headers=h)
    assert response.json() == {"quantity": 0, "deleted": False}


def test_quantity_delta_must_be_int(env, h):
    product = _post(env, h, "/api/products", {"name": "Lait", "quantity": 2})
    assert env.client.patch(f"/api/products/{product['id']}/quantity?delta=abc", headers=h).status_code == 422
    assert env.client.patch(f"/api/products/{product['id']}/quantity", headers=h).status_code == 422


def test_empty_lot_deleted_when_other_lot_exists(env, h):
    old = _post(env, h, "/api/products", {"name": "Yaourt", "barcode": "123", "quantity": 1, "expiration_date": "2026-10-25"})
    _post(env, h, "/api/products", {"name": "Yaourt", "barcode": "123", "quantity": 4, "expiration_date": "2026-11-30"})
    response = env.client.patch(f"/api/products/{old['id']}/quantity?delta=-1", headers=h)
    assert response.json() == {"quantity": 0, "deleted": True}
    assert env.client.get(f"/api/products/{old['id']}", headers=h).status_code == 404


def test_sole_lot_kept_at_zero(env, h):
    only = _post(env, h, "/api/products", {"name": "Yaourt", "barcode": "123", "quantity": 1})
    response = env.client.patch(f"/api/products/{only['id']}/quantity?delta=-1", headers=h)
    assert response.json() == {"quantity": 0, "deleted": False}


def test_lot_of_other_household_does_not_trigger_deletion(env, h):
    """Le lot d'un autre foyer avec le même code-barres ne compte pas comme « autre lot »."""
    bob, _ = env.make_user("bob")
    _post(env, env.headers(bob), "/api/products", {"name": "Yaourt", "barcode": "123", "quantity": 4})
    mine = _post(env, h, "/api/products", {"name": "Yaourt", "barcode": "123", "quantity": 1})
    response = env.client.patch(f"/api/products/{mine['id']}/quantity?delta=-1", headers=h)
    assert response.json()["deleted"] is False


def test_barcode_lookup_returns_earliest_expiring_lot(env, h):
    _post(env, h, "/api/products", {"name": "Lot sans date", "barcode": "999", "quantity": 1})
    _post(env, h, "/api/products", {"name": "Lot tardif", "barcode": "999", "quantity": 1, "expiration_date": "2027-01-01"})
    _post(env, h, "/api/products", {"name": "Lot urgent", "barcode": "999", "quantity": 1, "expiration_date": "2026-10-30"})
    assert env.client.get("/api/products/barcode/999", headers=h).json()["name"] == "Lot urgent"


def test_low_stock_filter(env, h):
    _post(env, h, "/api/products", {"name": "Bas", "quantity": 0, "min_quantity": 1})
    _post(env, h, "/api/products", {"name": "OK", "quantity": 3, "min_quantity": 1})
    names = [p["name"] for p in env.client.get("/api/products?low_stock=true", headers=h).json()]
    assert names == ["Bas"]


def test_search_filter_is_case_insensitive(env, h):
    _post(env, h, "/api/products", {"name": "Lait Demi", "brand": "Lactel"})
    _post(env, h, "/api/products", {"name": "Pâtes"})
    assert [p["name"] for p in env.client.get("/api/products?search=lactel", headers=h).json()] == ["Lait Demi"]


# ==================== SOUS-CATÉGORIES ====================

def test_sub_category_name_reused_case_insensitively(env, h):
    p1 = _post(env, h, "/api/products", {"name": "A", "sub_category_name": "  lait "})
    p2 = _post(env, h, "/api/products", {"name": "B", "sub_category_name": "LAIT"})
    assert p1["sub_category_id"] == p2["sub_category_id"]
    assert p1["sub_category_name"] == "Lait"
    assert len(env.client.get("/api/subcategories", headers=h).json()) == 1


@pytest.mark.xfail(
    strict=True,
    reason="BUG : POST /subcategories ne déduplique pas par casse (config_service.py:83) ; deux "
           "sous-catégories « Lait »/« lait » font ensuite planter _resolve_sub_category_id "
           "(product_service.py:209, scalar_one_or_none -> MultipleResultsFound -> 500)",
)
def test_case_duplicate_subcategories_do_not_break_product_creation(env, h):
    _post(env, h, "/api/subcategories", {"name": "Lait"})
    _post(env, h, "/api/subcategories", {"name": "lait"})
    response = env.client.post("/api/products", json={"name": "X", "sub_category_name": "LAIT"}, headers=h)
    assert response.status_code == 200, response.text


def test_rename_subcategory_merges_into_existing(env, h):
    target = _post(env, h, "/api/subcategories", {"name": "Lait", "min_quantity": 3})
    other = _post(env, h, "/api/subcategories", {"name": "Laitage"})
    product = _post(env, h, "/api/products", {"name": "X", "sub_category_id": other["id"]})
    merged = env.client.put(f"/api/subcategories/{other['id']}", json={"name": "LAIT"}, headers=h).json()
    assert merged["id"] == target["id"]
    assert merged["min_quantity"] == 3
    assert env.client.get(f"/api/products/{product['id']}", headers=h).json()["sub_category_id"] == target["id"]
    assert len(env.client.get("/api/subcategories", headers=h).json()) == 1


def test_threshold_patch_only_changes_min_quantity(env, h):
    sub = _post(env, h, "/api/subcategories", {"name": "Lait", "min_quantity": 1})
    updated = env.client.patch(f"/api/subcategories/{sub['id']}/threshold", json={"min_quantity": 6}, headers=h).json()
    assert (updated["name"], updated["min_quantity"]) == ("Lait", 6)


def test_delete_category_detaches_products(env, h):
    cat = _post(env, h, "/api/categories", {"name": "Frais"})
    product = _post(env, h, "/api/products", {"name": "Lait", "category_id": cat["id"]})
    assert env.client.delete(f"/api/categories/{cat['id']}", headers=h).status_code == 200
    fetched = env.client.get(f"/api/products/{product['id']}", headers=h).json()
    assert fetched["category_id"] is None


def test_delete_location_detaches_products(env, h):
    loc = _post(env, h, "/api/locations", {"name": "Frigo"})
    product = _post(env, h, "/api/products", {"name": "Lait", "location_id": loc["id"]})
    assert env.client.delete(f"/api/locations/{loc['id']}", headers=h).status_code == 200
    assert env.client.get(f"/api/products/{product['id']}", headers=h).json()["location_id"] is None


# ==================== ISOLATION (complément) ====================

def test_search_and_filters_do_not_leak_other_household(env, h):
    bob, _ = env.make_user("bob")
    hb = env.headers(bob)
    cat_b = _post(env, hb, "/api/categories", {"name": "Frais"})
    _post(env, hb, "/api/products", {"name": "Lait secret", "quantity": 0, "category_id": cat_b["id"]})
    assert env.client.get("/api/products?search=secret", headers=h).json() == []
    assert env.client.get(f"/api/products?category_id={cat_b['id']}", headers=h).json() == []
    assert env.client.get("/api/products?low_stock=true", headers=h).json() == []


def test_sub_category_name_does_not_reuse_other_household_subcategory(env, h):
    bob, _ = env.make_user("bob")
    sub_b = _post(env, env.headers(bob), "/api/subcategories", {"name": "Lait"})
    product = _post(env, h, "/api/products", {"name": "X", "sub_category_name": "Lait"})
    assert product["sub_category_id"] != sub_b["id"]


def test_rename_subcategory_does_not_merge_into_other_household(env, h):
    bob, _ = env.make_user("bob")
    sub_b = _post(env, env.headers(bob), "/api/subcategories", {"name": "Lait"})
    mine = _post(env, h, "/api/subcategories", {"name": "Laitage"})
    renamed = env.client.put(f"/api/subcategories/{mine['id']}", json={"name": "Lait"}, headers=h).json()
    assert renamed["id"] == mine["id"]
    assert env.client.get("/api/subcategories", headers=env.headers(bob)).json()[0]["id"] == sub_b["id"]
