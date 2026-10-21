"""Tests de la liste de courses (shopping_service) : génération automatique à
partir du stock bas, articles manuels, bascule/suppression/vidage, validation
et isolation entre foyers."""

# pylint: disable=redefined-outer-name

import pytest


@pytest.fixture
def alice(env):
    """Utilisatrice active avec son foyer personnel."""
    user, household = env.make_user("alice")
    return user, household, env.headers(user)


def _product(env, headers, **fields):
    payload = {"name": "Produit", "quantity": 0, "min_quantity": 1}
    payload.update(fields)
    response = env.client.post("/api/products", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _generate(env, headers):
    response = env.client.get("/api/shopping-list/generate", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# ==================== GÉNÉRATION AUTOMATIQUE ====================

def test_generate_adds_only_products_strictly_below_threshold(env, alice):
    _, _, h = alice
    low = _product(env, h, name="Lait", quantity=1, min_quantity=4, unit="litre")
    _product(env, h, name="Pâtes", quantity=2, min_quantity=2)  # égal au seuil : pas en stock bas
    _product(env, h, name="Riz", quantity=5, min_quantity=1)
    items = _generate(env, h)
    assert [(i["product_id"], i["name"], i["quantity"], i["unit"]) for i in items] == [
        (low["id"], "Lait", 3, "litre")
    ]


def test_generate_min_quantity_zero_never_listed(env, alice):
    _, _, h = alice
    _product(env, h, name="Optionnel", quantity=0, min_quantity=0)
    assert _generate(env, h) == []


def test_generate_is_idempotent(env, alice):
    _, _, h = alice
    _product(env, h, name="Lait", quantity=0, min_quantity=2)
    first = _generate(env, h)
    second = _generate(env, h)
    assert len(first) == len(second) == 1
    assert len(env.client.get("/api/shopping-list", headers=h).json()) == 1


def test_generate_keeps_manual_items(env, alice):
    _, _, h = alice
    env.client.post("/api/shopping-list", json={"name": "Pain"}, headers=h)
    _product(env, h, name="Lait", quantity=0, min_quantity=1)
    names = sorted(i["name"] for i in _generate(env, h))
    assert names == ["Lait", "Pain"]


def test_generate_drops_items_once_restocked(env, alice):
    _, _, h = alice
    product = _product(env, h, name="Lait", quantity=0, min_quantity=2)
    _generate(env, h)
    env.client.patch(f"/api/products/{product['id']}/quantity?delta=5", headers=h)
    assert _generate(env, h) == []


def test_generate_reflects_quantity_change(env, alice):
    _, _, h = alice
    product = _product(env, h, name="Lait", quantity=0, min_quantity=5)
    assert _generate(env, h)[0]["quantity"] == 5
    env.client.patch(f"/api/products/{product['id']}/quantity?delta=2", headers=h)
    assert _generate(env, h)[0]["quantity"] == 3


def test_generate_default_unit_when_product_unit_null(env, alice):
    _, _, h = alice
    _product(env, h, name="Sel", quantity=0, min_quantity=1, unit=None)
    assert _generate(env, h)[0]["unit"] == "unité"


@pytest.mark.xfail(
    strict=True,
    reason="BUG : un produit supprimé laisse son article auto-généré orphelin (FK ON DELETE SET NULL, "
           "models.py:268) ; product_id devient NULL et /generate (shopping_service.py:38-43) "
           "ne le nettoie plus jamais",
)
def test_deleted_product_item_removed_on_next_generate(env, alice):
    _, _, h = alice
    product = _product(env, h, name="Lait", quantity=0, min_quantity=1)
    _generate(env, h)
    assert env.client.delete(f"/api/products/{product['id']}", headers=h).status_code == 200
    assert _generate(env, h) == []


@pytest.mark.xfail(
    strict=True,
    reason="BUG : /generate supprime aussi les articles auto déjà cochés (shopping_service.py:38-43) : "
           "l'état « dans le panier » est perdu à chaque régénération",
)
def test_generate_preserves_checked_state(env, alice):
    _, _, h = alice
    _product(env, h, name="Lait", quantity=0, min_quantity=1)
    item = _generate(env, h)[0]
    env.client.patch(f"/api/shopping-list/{item['id']}/toggle", headers=h)
    regenerated = _generate(env, h)
    assert regenerated[0]["is_checked"] is True


# ==================== ARTICLES MANUELS ====================

def test_toggle_and_clear_checked_only(env, alice):
    _, _, h = alice
    a = env.client.post("/api/shopping-list", json={"name": "Pain"}, headers=h).json()
    env.client.post("/api/shopping-list", json={"name": "Beurre"}, headers=h)
    assert env.client.patch(f"/api/shopping-list/{a['id']}/toggle", headers=h).json() == {"is_checked": True}
    env.client.delete("/api/shopping-list", headers=h)  # checked_only=True par défaut
    assert [i["name"] for i in env.client.get("/api/shopping-list", headers=h).json()] == ["Beurre"]
    env.client.delete("/api/shopping-list?checked_only=false", headers=h)
    assert env.client.get("/api/shopping-list", headers=h).json() == []


def test_toggle_twice_returns_to_unchecked(env, alice):
    _, _, h = alice
    item = env.client.post("/api/shopping-list", json={"name": "Pain"}, headers=h).json()
    env.client.patch(f"/api/shopping-list/{item['id']}/toggle", headers=h)
    assert env.client.patch(f"/api/shopping-list/{item['id']}/toggle", headers=h).json() == {"is_checked": False}


def test_bulk_empty_list_returns_empty(env, alice):
    _, _, h = alice
    response = env.client.post("/api/shopping-list/bulk", json=[], headers=h)
    assert response.status_code == 200
    assert response.json() == []


def test_bulk_adds_all_items(env, alice):
    _, _, h = alice
    response = env.client.post(
        "/api/shopping-list/bulk", json=[{"name": "Œufs", "quantity": 12}, {"name": "Café ☕"}], headers=h
    )
    assert response.status_code == 200
    assert sorted(i["name"] for i in response.json()) == ["Café ☕", "Œufs"]


def test_unknown_item_404(env, alice):
    _, _, h = alice
    assert env.client.patch("/api/shopping-list/inconnu/toggle", headers=h).status_code == 404
    assert env.client.delete("/api/shopping-list/inconnu", headers=h).status_code == 404


def test_missing_name_422(env, alice):
    _, _, h = alice
    assert env.client.post("/api/shopping-list", json={"quantity": 2}, headers=h).status_code == 422


@pytest.mark.xfail(strict=True, reason="BUG mineur : quantité nulle/négative acceptée (schemas.ShoppingListItemBase sans ge=1)")
@pytest.mark.parametrize("quantity", [0, -3])
def test_non_positive_quantity_rejected(env, alice, quantity):
    _, _, h = alice
    response = env.client.post("/api/shopping-list", json={"name": "Pain", "quantity": quantity}, headers=h)
    assert response.status_code in (400, 422)


@pytest.mark.xfail(strict=True, reason="BUG mineur : nom vide accepté (schemas.ShoppingListItemBase sans min_length)")
def test_empty_name_rejected(env, alice):
    _, _, h = alice
    response = env.client.post("/api/shopping-list", json={"name": ""}, headers=h)
    assert response.status_code in (400, 422)


def test_requires_auth(env):
    assert env.client.get("/api/shopping-list").status_code in (401, 403)
    assert env.client.get("/api/shopping-list/generate").status_code in (401, 403)


# ==================== ISOLATION ====================

def test_generate_in_shared_household_and_isolation(env):
    """Bob membre du foyer partagé d'Alice voit la liste générée ; Carol non."""
    alice, house_a = env.make_user("alice")
    bob, _ = env.make_user("bob")
    carol, _ = env.make_user("carol")
    env.add_member(bob, house_a)
    _product(env, env.headers(alice), name="Lait", quantity=0, min_quantity=1)
    items = _generate(env, env.headers(bob))
    assert [i["name"] for i in items] == ["Lait"]
    assert _generate(env, env.headers(carol)) == []
    # Carol ne peut ni cocher ni supprimer l'article du foyer A
    assert env.client.patch(f"/api/shopping-list/{items[0]['id']}/toggle", headers=env.headers(carol)).status_code == 404
    assert env.client.delete(f"/api/shopping-list/{items[0]['id']}", headers=env.headers(carol)).status_code == 404
    env.client.delete("/api/shopping-list?checked_only=false", headers=env.headers(carol))
    assert len(env.client.get("/api/shopping-list", headers=env.headers(alice)).json()) == 1


def test_generate_by_other_household_does_not_delete_my_auto_items(env):
    alice, _ = env.make_user("alice")
    bob, _ = env.make_user("bob")
    _product(env, env.headers(alice), name="Lait", quantity=0, min_quantity=1)
    _generate(env, env.headers(alice))
    _generate(env, env.headers(bob))
    assert len(env.client.get("/api/shopping-list", headers=env.headers(alice)).json()) == 1
