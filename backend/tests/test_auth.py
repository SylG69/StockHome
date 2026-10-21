"""Authentification et autorisations : JWT, statuts pending/disabled,
require_admin, statistiques API (super-admin) et inscription/connexion."""

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

import auth
import models


# ==================== JETON ====================

def test_expired_token_401(env):
    user, _ = env.make_user("alice")
    token = jwt.encode(
        {"sub": user.id, "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        auth.JWT_SECRET, algorithm=auth.JWT_ALGORITHM,
    )
    response = env.client.get("/api/products", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_token_signed_with_other_secret_401(env):
    user, _ = env.make_user("alice")
    token = jwt.encode({"sub": user.id}, "autre-secret", algorithm="HS256")
    assert env.client.get("/api/products", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_alg_none_rejected(env):
    user, _ = env.make_user("alice")
    token = jwt.encode({"sub": user.id}, "", algorithm="HS256").rsplit(".", 1)[0] + "."
    assert env.client.get("/api/products", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_without_sub_401(env):
    token = jwt.encode({"exp": datetime.now(timezone.utc) + timedelta(hours=1)}, auth.JWT_SECRET, algorithm="HS256")
    assert env.client.get("/api/products", headers={"Authorization": f"Bearer {token}"}).status_code == 401


@pytest.mark.xfail(
    strict=True,
    reason="Écart mineur : jeton d'un compte supprimé -> 404 'User not found' (auth.py:65) au lieu de 401",
)
def test_token_of_deleted_user_401(env):
    token = auth.create_token("id-inexistant")
    assert env.client.get("/api/products", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# ==================== STATUTS ====================

@pytest.mark.parametrize("status", ["pending", "disabled"])
@pytest.mark.parametrize(
    "path",
    ["/api/products", "/api/categories", "/api/shopping-list", "/api/chores", "/api/loans",
     "/api/dashboard/stats", "/api/households"],
)
def test_inactive_accounts_refused_on_business_routes(env, status, path):
    user, _ = env.make_user("carol", status=status)
    assert env.client.get(path, headers=env.headers(user)).status_code == 403


@pytest.mark.parametrize("status", ["pending", "disabled"])
def test_me_accessible_for_inactive_accounts(env, status):
    user, _ = env.make_user("carol", status=status)
    response = env.client.get("/api/auth/me", headers=env.headers(user))
    assert response.status_code == 200
    assert response.json()["status"] == status


@pytest.mark.parametrize("status", ["pending", "disabled"])
def test_patch_me_refused_for_inactive_accounts(env, status):
    user, _ = env.make_user("carol", status=status)
    response = env.client.patch("/api/auth/me", json={"first_name": "X"}, headers=env.headers(user))
    assert response.status_code == 403


@pytest.mark.parametrize("status", ["pending", "disabled"])
def test_disabled_admin_cannot_use_admin_routes(env, status):
    user, _ = env.make_user("root", role="admin", status=status)
    assert env.client.get("/api/auth/users", headers=env.headers(user)).status_code == 403


def test_disabling_account_revokes_existing_token(env):
    """Un jeton émis avant la désactivation doit être refusé dès la désactivation."""
    admin, _ = env.make_user("root", role="admin")
    user, _ = env.make_user("carol")
    headers = env.headers(user)
    assert env.client.get("/api/products", headers=headers).status_code == 200
    response = env.client.patch(
        f"/api/auth/users/{user.id}/status", json={"status": "disabled"}, headers=env.headers(admin)
    )
    assert response.status_code == 200
    assert env.client.get("/api/products", headers=headers).status_code == 403


# ==================== require_admin ====================

ADMIN_ROUTES = [
    ("get", "/api/auth/users", None),
    ("patch", "/api/auth/users/{target}/status", {"status": "active"}),
    ("patch", "/api/auth/users/{target}/role", {"role": "admin"}),
    ("delete", "/api/auth/users/{target}", None),
    ("get", "/api/admin/api-stats/self", None),
    ("get", "/api/admin/api-stats/global", None),
]


@pytest.mark.parametrize("method, path, body", ADMIN_ROUTES)
def test_admin_routes_forbidden_for_regular_user(env, method, path, body):
    user, _ = env.make_user("carol")
    target, _ = env.make_user("dave", status="pending")
    kwargs = {"headers": env.headers(user)}
    if body is not None:
        kwargs["json"] = body
    response = getattr(env.client, method)(path.format(target=target.id), **kwargs)
    assert response.status_code == 403
    db = env.session_factory()
    try:
        refreshed = db.get(models.User, target.id)
        assert refreshed is not None and refreshed.status == "pending" and refreshed.role == "user"
    finally:
        db.close()


def test_household_admin_is_not_app_admin(env):
    """Être admin de son foyer (toujours vrai pour le foyer perso) ne donne pas require_admin."""
    user, _ = env.make_user("carol")
    assert env.client.get("/api/auth/users", headers=env.headers(user)).status_code == 403


def test_admin_can_approve_pending_user(env):
    admin, _ = env.make_user("root", role="admin")
    target, _ = env.make_user("dave", status="pending")
    response = env.client.patch(
        f"/api/auth/users/{target.id}/status", json={"status": "active"}, headers=env.headers(admin)
    )
    assert response.status_code == 200 and response.json()["status"] == "active"
    assert env.client.get("/api/products", headers=env.headers(target)).status_code == 200


@pytest.mark.parametrize(
    "suffix, body, expected",
    [
        ("/status", {"status": "superuser"}, 400),
        ("/role", {"role": "god"}, 400),
    ],
)
def test_admin_invalid_values_rejected(env, suffix, body, expected):
    admin, _ = env.make_user("root", role="admin")
    target, _ = env.make_user("dave")
    response = env.client.patch(f"/api/auth/users/{target.id}{suffix}", json=body, headers=env.headers(admin))
    assert response.status_code == expected


@pytest.mark.parametrize("method, suffix, body", [
    ("patch", "/status", {"status": "disabled"}),
    ("patch", "/role", {"role": "user"}),
    ("delete", "", None),
])
def test_admin_cannot_act_on_self(env, method, suffix, body):
    admin, _ = env.make_user("root", role="admin")
    kwargs = {"headers": env.headers(admin)}
    if body is not None:
        kwargs["json"] = body
    assert getattr(env.client, method)(f"/api/auth/users/{admin.id}{suffix}", **kwargs).status_code == 400


def test_admin_unknown_user_404(env):
    admin, _ = env.make_user("root", role="admin")
    response = env.client.patch(
        "/api/auth/users/inconnu/status", json={"status": "active"}, headers=env.headers(admin)
    )
    assert response.status_code == 404


def test_protected_admin_email_cannot_be_disabled(env):
    admin, _ = env.make_user("root", role="admin")
    owner = models.User(email="s.greneron@gmail.com", username="owner", role="admin", status="active")
    env.db.add(owner)
    env.db.commit()
    response = env.client.patch(
        f"/api/auth/users/{owner.id}/status", json={"status": "disabled"}, headers=env.headers(admin)
    )
    assert response.status_code == 400


def test_api_stats_global_restricted_to_super_admin(env):
    admin, _ = env.make_user("root", role="admin")
    assert env.client.get("/api/admin/api-stats/global", headers=env.headers(admin)).status_code == 403
    assert env.client.get("/api/admin/api-stats/self", headers=env.headers(admin)).status_code == 200


def test_api_stats_self_only_counts_own_calls(env):
    admin, _ = env.make_user("root", role="admin")
    other, _ = env.make_user("carol")
    env.db.add_all([
        models.ApiCallLog(user_id=admin.id, source="BnF", success=True),
        models.ApiCallLog(user_id=other.id, source="BnF", success=False),
        models.ApiCallLog(user_id=other.id, source="Wikidata", success=True),
    ])
    env.db.commit()
    stats = env.client.get("/api/admin/api-stats/self", headers=env.headers(admin)).json()
    assert stats == [{"source": "BnF", "count": 1, "success_count": 1}]


# ==================== INSCRIPTION / CONNEXION ====================

def _register(env, email, password="motdepasse", username="u"):
    return env.client.post("/api/auth/register", json={"email": email, "username": username, "password": password})


def test_first_user_is_admin_then_pending(env):
    first = _register(env, "first@example.com")
    assert first.status_code == 200, first.text
    assert first.json()["user"]["role"] == "admin" and first.json()["user"]["status"] == "active"
    second = _register(env, "second@example.com")
    assert second.json()["user"]["role"] == "user" and second.json()["user"]["status"] == "pending"


def test_login_pending_and_disabled_refused(env):
    _register(env, "first@example.com")
    _register(env, "second@example.com", password="secret123")
    response = env.client.post("/api/auth/login", json={"email": "second@example.com", "password": "secret123"})
    assert response.status_code == 403

    db = env.session_factory()
    user = db.query(models.User).filter_by(email="second@example.com").one()
    user.status = "disabled"
    db.commit()
    db.close()
    response = env.client.post("/api/auth/login", json={"email": "second@example.com", "password": "secret123"})
    assert response.status_code == 403


@pytest.mark.parametrize("email, password", [("first@example.com", "faux"), ("inconnu@example.com", "x")])
def test_login_bad_credentials_401(env, email, password):
    _register(env, "first@example.com")
    response = env.client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 401


def test_register_duplicate_email_400(env):
    _register(env, "first@example.com")
    assert _register(env, "first@example.com").status_code == 400


@pytest.mark.xfail(
    strict=True,
    reason="BUG mineur : unicité email sensible à la casse (auth_service.py:229) -> doublons Alice@/alice@",
)
def test_register_duplicate_email_case_insensitive(env):
    _register(env, "alice@example.com")
    assert _register(env, "Alice@example.com").status_code == 400


@pytest.mark.xfail(strict=True, reason="BUG mineur : aucun contrôle de longueur minimale du mot de passe (schemas.UserRegister)")
def test_register_empty_password_rejected(env):
    _register(env, "first@example.com")
    assert _register(env, "second@example.com", password="").status_code in (400, 422)


def test_register_creates_personal_household_isolated(env):
    a = _register(env, "first@example.com").json()
    b = _register(env, "second@example.com").json()
    db = env.session_factory()
    try:
        ua = db.get(models.User, a["user"]["id"])
        ub = db.get(models.User, b["user"]["id"])
        assert ua.active_household_id and ub.active_household_id
        assert ua.active_household_id != ub.active_household_id
    finally:
        db.close()
