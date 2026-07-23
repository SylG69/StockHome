"""Vérifie que l'application FastAPI se charge et expose les routers attendus."""

from main import app


def test_app_loads():
    assert app.title == "StockHome API"


def test_routers_are_registered():
    paths = app.openapi()["paths"].keys()
    assert any(path.startswith("/api/auth") for path in paths)
    assert any(path.startswith("/api/products") for path in paths)
    assert any(path.startswith("/api/shopping-list") for path in paths)
