"""Tests des statistiques du tableau de bord (dashboard_service)."""

# pylint: disable=redefined-outer-name

from datetime import date, timedelta

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


def _stats(env, h):
    response = env.client.get("/api/dashboard/stats", headers=h)
    assert response.status_code == 200, response.text
    return response.json()


def test_empty_household_stats(env, h):
    stats = _stats(env, h)
    assert stats["total_products"] == 0
    assert stats["total_stock_value"] == 0.0
    assert stats["low_stock_count"] == 0
    assert stats["expiring_soon_count"] == 0
    assert stats["recent_products"] == []


def test_stock_value_ignores_products_without_price(env, h):
    _post(env, h, "/api/products", {"name": "A", "quantity": 3, "price": 2.5})
    _post(env, h, "/api/products", {"name": "B", "quantity": 10})
    assert _stats(env, h)["total_stock_value"] == pytest.approx(7.5)


def test_products_by_category_includes_uncategorized(env, h):
    cat = _post(env, h, "/api/categories", {"name": "Frais"})
    _post(env, h, "/api/products", {"name": "A", "category_id": cat["id"]})
    _post(env, h, "/api/products", {"name": "B"})
    assert _stats(env, h)["products_by_category"] == {cat["id"]: 1, "uncategorized": 1}


def test_low_stock_by_subcategory_sums_all_lots(env, h):
    sub = _post(env, h, "/api/subcategories", {"name": "Lait", "min_quantity": 5})
    _post(env, h, "/api/subcategories", {"name": "Sans seuil", "min_quantity": 0})
    _post(env, h, "/api/products", {"name": "Lot 1", "quantity": 2, "sub_category_id": sub["id"]})
    _post(env, h, "/api/products", {"name": "Lot 2", "quantity": 2, "sub_category_id": sub["id"]})
    stats = _stats(env, h)
    assert stats["low_stock_count"] == 1
    assert stats["low_stock_subcategories"][0] == {"id": sub["id"], "name": "Lait", "total_stock": 4, "threshold": 5}
    _post(env, h, "/api/products", {"name": "Lot 3", "quantity": 1, "sub_category_id": sub["id"]})
    assert _stats(env, h)["low_stock_count"] == 0


def test_subcategory_with_threshold_and_no_product_is_low(env, h):
    _post(env, h, "/api/subcategories", {"name": "Café", "min_quantity": 1})
    assert _stats(env, h)["low_stock_subcategories"][0]["total_stock"] == 0


def test_expiring_soon_window_and_zero_quantity(env, h):
    today = date.today()
    _post(env, h, "/api/products", {"name": "Périmé", "quantity": 1, "expiration_date": str(today - timedelta(days=1))})
    _post(env, h, "/api/products", {"name": "J+7", "quantity": 1, "expiration_date": str(today + timedelta(days=7))})
    _post(env, h, "/api/products", {"name": "J+8", "quantity": 1, "expiration_date": str(today + timedelta(days=8))})
    _post(env, h, "/api/products", {"name": "Vide", "quantity": 0, "expiration_date": str(today)})
    stats = _stats(env, h)
    assert [p["name"] for p in stats["expiring_soon_products"]] == ["Périmé", "J+7"]
    assert stats["expiring_soon_count"] == 2


def test_shopping_list_count_only_unchecked(env, h):
    item = _post(env, h, "/api/shopping-list", {"name": "Pain"})
    _post(env, h, "/api/shopping-list", {"name": "Beurre"})
    env.client.patch(f"/api/shopping-list/{item['id']}/toggle", headers=h)
    assert _stats(env, h)["shopping_list_count"] == 1


def test_recent_products_limited_to_five(env, h):
    for i in range(7):
        _post(env, h, "/api/products", {"name": f"P{i}"})
    assert len(_stats(env, h)["recent_products"]) == 5


def test_stats_fully_scoped_to_active_household(env, h):
    bob, _ = env.make_user("bob")
    hb = env.headers(bob)
    sub = _post(env, hb, "/api/subcategories", {"name": "Lait", "min_quantity": 5})
    _post(env, hb, "/api/products", {"name": "X", "quantity": 1, "price": 9, "sub_category_id": sub["id"],
                                     "expiration_date": str(date.today())})
    _post(env, hb, "/api/shopping-list", {"name": "Pain"})
    _post(env, hb, "/api/categories", {"name": "C"})
    _post(env, hb, "/api/locations", {"name": "L"})
    stats = _stats(env, h)
    assert (stats["total_products"], stats["total_stock_value"], stats["low_stock_count"],
            stats["expiring_soon_count"], stats["shopping_list_count"], stats["total_categories"],
            stats["total_locations"]) == (0, 0.0, 0, 0, 0, 0, 0)
