"""Isolation multi-foyer sur les modules métier (produits, configuration,
liste de courses, tâches, tableau de bord) : un objet d'un autre foyer doit
renvoyer 404 et ne jamais être modifié ; les références croisées
(category_id, product_id...) vers un autre foyer doivent être refusées."""

# pylint: disable=redefined-outer-name

from types import SimpleNamespace

import pytest

import models


@pytest.fixture
def world(env):
    """Alice (foyer A) possède un jeu complet d'objets ; Bob (foyer B) n'a rien."""
    alice, house_a = env.make_user("alice")
    bob, house_b = env.make_user("bob")
    h = env.headers(alice)
    c = env.client

    def ok(response):
        assert response.status_code == 200, response.text
        return response.json()

    category = ok(c.post("/api/categories", json={"name": "Frais"}, headers=h))
    location = ok(c.post("/api/locations", json={"name": "Frigo"}, headers=h))
    sub = ok(c.post("/api/subcategories", json={"name": "Lait", "category_id": category["id"]}, headers=h))
    product = ok(c.post(
        "/api/products",
        json={"name": "Lait demi-écrémé", "barcode": "3017620422003", "quantity": 3,
              "category_id": category["id"], "location_id": location["id"], "sub_category_id": sub["id"]},
        headers=h,
    ))
    item = ok(c.post("/api/shopping-list", json={"name": "Pain"}, headers=h))
    chore = ok(c.post("/api/chores", json={"name": "Vaisselle"}, headers=h))
    log = ok(c.post(f"/api/chores/{chore['id']}/execute", headers=h))
    return SimpleNamespace(
        alice=alice, bob=bob, house_a=house_a, house_b=house_b,
        category=category, location=location, sub=sub, product=product,
        item=item, chore=chore, log=log,
    )


# ==================== LISTES : rien ne fuit ====================

@pytest.mark.parametrize(
    "path",
    ["/api/products", "/api/categories", "/api/subcategories", "/api/locations",
     "/api/shopping-list", "/api/chores", "/api/chores/logs", "/api/loans"],
)
def test_lists_are_scoped(env, world, path):
    response = env.client.get(path, headers=env.headers(world.bob))
    assert response.status_code == 200, response.text
    assert response.json() == []


def test_dashboard_stats_scoped(env, world):
    stats = env.client.get("/api/dashboard/stats", headers=env.headers(world.bob)).json()
    assert stats["total_products"] == 0


def test_product_by_barcode_scoped(env, world):
    response = env.client.get("/api/products/barcode/3017620422003", headers=env.headers(world.bob))
    assert response.status_code == 404


def test_shopping_generate_does_not_use_other_household_products(env, world):
    """Le produit d'Alice est sous le seuil ; la génération pour Bob ne doit pas le proposer."""
    env.client.patch(f"/api/products/{world.product['id']}/quantity?delta=-3", headers=env.headers(world.alice))
    generated = env.client.get("/api/shopping-list/generate", headers=env.headers(world.bob)).json()
    assert all(entry.get("product_id") != world.product["id"] for entry in generated)


# ==================== ACCÈS DIRECT PAR ID : 404 ====================

CASES = [
    ("get", "/api/products/{product}", None),
    ("put", "/api/products/{product}", {"name": "Piraté"}),
    ("patch", "/api/products/{product}/quantity?delta=5", None),
    ("delete", "/api/products/{product}", None),
    ("post", "/api/products/{product}/refresh-off", None),
    ("put", "/api/categories/{category}", {"name": "Piraté"}),
    ("delete", "/api/categories/{category}", None),
    ("put", "/api/subcategories/{sub}", {"name": "Piraté"}),
    ("patch", "/api/subcategories/{sub}/threshold", {"min_quantity": 99}),
    ("delete", "/api/subcategories/{sub}", None),
    ("put", "/api/locations/{location}", {"name": "Piraté"}),
    ("delete", "/api/locations/{location}", None),
    ("patch", "/api/shopping-list/{item}/toggle", None),
    ("delete", "/api/shopping-list/{item}", None),
    ("get", "/api/chores/{chore}", None),
    ("put", "/api/chores/{chore}", {"name": "Piraté"}),
    ("delete", "/api/chores/{chore}", None),
    ("post", "/api/chores/{chore}/execute", None),
    ("post", "/api/chores/{chore}/skip", None),
    ("get", "/api/chores/{chore}/logs", None),
    ("delete", "/api/chores/logs/{log}", None),
]


def _ids(world):
    return {
        "product": world.product["id"], "category": world.category["id"], "sub": world.sub["id"],
        "location": world.location["id"], "item": world.item["id"], "chore": world.chore["id"],
        "log": world.log["log"]["id"],
    }


@pytest.mark.parametrize("method, template, body", CASES, ids=[f"{m.upper()} {t}" for m, t, _ in CASES])
def test_other_household_object_returns_404(env, world, method, template, body):
    ids = _ids(world)
    if template.endswith("{log}") and not ids["log"]:
        pytest.skip("identifiant de log non exposé par /execute")
    kwargs = {"headers": env.headers(world.bob)}
    if body is not None:
        kwargs["json"] = body
    response = getattr(env.client, method)(template.format(**ids), **kwargs)
    assert response.status_code == 404, f"{response.status_code} {response.text}"


def test_other_household_objects_untouched_after_attacks(env, world):
    """Après toutes les tentatives de Bob, les objets d'Alice sont intacts."""
    ids = _ids(world)
    for method, template, body in CASES:
        if template.endswith("{log}") and not ids["log"]:
            continue
        kwargs = {"headers": env.headers(world.bob)}
        if body is not None:
            kwargs["json"] = body
        getattr(env.client, method)(template.format(**ids), **kwargs)

    db = env.session_factory()
    try:
        product = db.get(models.Product, ids["product"])
        assert product is not None and product.name == "Lait demi-écrémé" and product.quantity == 3
        assert db.get(models.Category, ids["category"]).name == "Frais"
        assert db.get(models.SubCategory, ids["sub"]).min_quantity == 0
        assert db.get(models.StorageLocation, ids["location"]) is not None
        item = db.get(models.ShoppingListItem, ids["item"])
        assert item is not None and item.is_checked is False
        assert db.get(models.Chore, ids["chore"]).name == "Vaisselle"
    finally:
        db.close()


def test_clear_shopping_list_only_clears_own_household(env, world):
    assert env.client.delete("/api/shopping-list", headers=env.headers(world.bob)).status_code == 200
    items = env.client.get("/api/shopping-list", headers=env.headers(world.alice)).json()
    assert [i["id"] for i in items] == [world.item["id"]]


# ==================== RÉFÉRENCES CROISÉES ====================

@pytest.mark.parametrize("field", ["category_id", "location_id", "sub_category_id"])
def test_product_create_rejects_foreign_refs(env, world, field):
    ref = {"category_id": world.category["id"], "location_id": world.location["id"],
           "sub_category_id": world.sub["id"]}[field]
    response = env.client.post("/api/products", json={"name": "X", field: ref}, headers=env.headers(world.bob))
    assert response.status_code == 400


def test_product_update_rejects_foreign_category(env, world):
    own = env.client.post("/api/products", json={"name": "X"}, headers=env.headers(world.bob)).json()
    response = env.client.put(
        f"/api/products/{own['id']}", json={"category_id": world.category["id"]}, headers=env.headers(world.bob)
    )
    assert response.status_code == 400


@pytest.mark.xfail(
    strict=True,
    reason="BUG isolation : config_service.create_subcategory (config_service.py:91) ne vérifie pas "
    "que category_id appartient au foyer actif",
)
def test_subcategory_create_rejects_foreign_category(env, world):
    response = env.client.post(
        "/api/subcategories", json={"name": "Intrus", "category_id": world.category["id"]},
        headers=env.headers(world.bob),
    )
    assert response.status_code in (400, 404)


@pytest.mark.xfail(
    strict=True,
    reason="BUG isolation : config_service.update_subcategory (config_service.py:140) applique "
    "category_id sans vérifier son foyer",
)
def test_subcategory_update_rejects_foreign_category(env, world):
    own = env.client.post("/api/subcategories", json={"name": "Mien"}, headers=env.headers(world.bob)).json()
    response = env.client.put(
        f"/api/subcategories/{own['id']}", json={"name": "Mien", "category_id": world.category["id"]},
        headers=env.headers(world.bob),
    )
    assert response.status_code in (400, 404)


@pytest.mark.xfail(
    strict=True,
    reason="BUG isolation : shopping_service.add_shopping_list_item (shopping_service.py:72) et /bulk "
    "acceptent un product_id d'un autre foyer",
)
@pytest.mark.parametrize("path", ["/api/shopping-list", "/api/shopping-list/bulk"])
def test_shopping_item_rejects_foreign_product(env, world, path):
    item = {"name": "Intrus", "product_id": world.product["id"]}
    body = [item] if path.endswith("bulk") else item
    response = env.client.post(path, json=body, headers=env.headers(world.bob))
    assert response.status_code in (400, 404)


def test_chore_rejects_assignee_from_other_household(env, world):
    response = env.client.post(
        "/api/chores", json={"name": "X", "assigned_user_id": world.alice.id}, headers=env.headers(world.bob)
    )
    assert response.status_code == 400


def test_chore_rejects_eligible_users_from_other_household(env, world):
    response = env.client.post(
        "/api/chores", json={"name": "X", "eligible_user_ids": [world.alice.id]}, headers=env.headers(world.bob)
    )
    assert response.status_code == 400


# ==================== FOYERS ====================

def test_household_detail_of_non_member_forbidden(env, world):
    response = env.client.get(f"/api/households/{world.house_a.id}", headers=env.headers(world.bob))
    assert response.status_code in (403, 404)


def test_cannot_switch_to_household_without_membership(env, world):
    response = env.client.post(
        "/api/households/switch", json={"household_id": world.house_a.id}, headers=env.headers(world.bob)
    )
    assert response.status_code in (403, 404)
    assert env.client.get("/api/products", headers=env.headers(world.bob)).json() == []


def test_transfer_stock_to_non_member_household_forbidden(env, world):
    response = env.client.post(
        f"/api/households/{world.house_b.id}/transfer-stock", headers=env.headers(world.alice)
    )
    assert response.status_code == 403
    assert len(env.client.get("/api/products", headers=env.headers(world.alice)).json()) == 1


@pytest.mark.xfail(
    strict=True,
    reason="BUG autorisation : household_service.transfer_stock (household_service.py:193) ne vérifie "
    "que l'adhésion au foyer CIBLE ; un simple membre d'un foyer partagé peut en vider tout le stock "
    "vers son foyer personnel",
)
def test_transfer_stock_from_shared_household_requires_admin(env):
    alice, _ = env.make_user("alice")
    bob, bob_personal = env.make_user("bob")
    shared = models.Household(name="Coloc", is_personal=False)
    env.db.add(shared)
    env.db.commit()
    env.add_member(alice, shared, role="admin")
    env.add_member(bob, shared, role="member", activate=True)
    assert env.client.post("/api/products", json={"name": "Riz"}, headers=env.headers(alice)).status_code == 200

    response = env.client.post(f"/api/households/{bob_personal.id}/transfer-stock", headers=env.headers(bob))
    assert response.status_code == 403
    assert len(env.client.get("/api/products", headers=env.headers(alice)).json()) == 1
