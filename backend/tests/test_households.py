"""Tests de la gestion des foyers (household_service) : création, invitation,
adhésion, départ, retrait de membre, suppression, bascule de foyer actif et
réglages réservés à l'administrateur du foyer."""

# pylint: disable=redefined-outer-name

from types import SimpleNamespace

import pytest

import models


@pytest.fixture
def shared(env):
    """Alice crée un foyer partagé « Coloc » et Bob le rejoint via le code."""
    alice, personal_a = env.make_user("alice")
    bob, personal_b = env.make_user("bob")
    ha, hb = env.headers(alice), env.headers(bob)
    created = env.client.post("/api/households", json={"name": "Coloc"}, headers=ha)
    assert created.status_code == 200, created.text
    house = created.json()
    joined = env.client.post("/api/households/join", json={"invite_code": house["invite_code"]}, headers=hb)
    assert joined.status_code == 200, joined.text
    return SimpleNamespace(alice=alice, bob=bob, ha=ha, hb=hb, house=house,
                           personal_a=personal_a, personal_b=personal_b)


def _switch(env, headers, household_id):
    response = env.client.post("/api/households/switch", json={"household_id": household_id}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# ==================== CRÉATION / INVITATION ====================

def test_create_household_creator_is_admin_with_invite_code(shared):
    assert shared.house["role"] == "admin"
    assert shared.house["is_personal"] is False
    assert len(shared.house["invite_code"]) == 8


def test_create_with_defaults_populates_categories(env):
    alice, _ = env.make_user("alice")
    ha = env.headers(alice)
    house = env.client.post("/api/households", json={"name": "Maison", "create_defaults": True}, headers=ha).json()
    _switch(env, ha, house["id"])
    assert len(env.client.get("/api/categories", headers=ha).json()) > 0


def test_member_does_not_see_invite_code(env, shared):
    detail = env.client.get(f"/api/households/{shared.house['id']}", headers=shared.hb).json()
    assert detail["role"] == "member"
    assert detail["invite_code"] is None
    assert detail["member_count"] == 2


def test_join_invalid_code_404(env):
    alice, _ = env.make_user("alice")
    response = env.client.post("/api/households/join", json={"invite_code": "ZZZZZZZZ"}, headers=env.headers(alice))
    assert response.status_code == 404


def test_join_twice_400(env, shared):
    response = env.client.post(
        "/api/households/join", json={"invite_code": shared.house["invite_code"]}, headers=shared.hb
    )
    assert response.status_code == 400


def test_regenerate_invite_code_invalidates_old_one(env, shared):
    old = shared.house["invite_code"]
    new = env.client.post(f"/api/households/{shared.house['id']}/invite-code/regenerate", headers=shared.ha).json()
    assert new["invite_code"] != old
    carol, _ = env.make_user("carol")
    hc = env.headers(carol)
    assert env.client.post("/api/households/join", json={"invite_code": old}, headers=hc).status_code == 404
    assert env.client.post("/api/households/join", json={"invite_code": new["invite_code"]}, headers=hc).status_code == 200


def test_regenerate_invite_code_member_forbidden(env, shared):
    response = env.client.post(f"/api/households/{shared.house['id']}/invite-code/regenerate", headers=shared.hb)
    assert response.status_code == 403


def test_regenerate_invite_code_personal_400(env, shared):
    response = env.client.post(f"/api/households/{shared.personal_a.id}/invite-code/regenerate", headers=shared.ha)
    assert response.status_code == 400


def test_personal_household_cannot_be_joined_via_code(env, shared):
    """Les foyers personnels n'ont pas de code : impossible d'y entrer."""
    env.db.expire_all()
    personal = env.db.get(models.Household, shared.personal_a.id)
    assert personal.invite_code is None


# ==================== RÉGLAGES (admin du foyer) ====================

@pytest.mark.parametrize("path, body", [
    ("rewards-settings", {"weekday": 3}),
    ("loans-settings", {"loan_book_duration_days": 30}),
])
def test_settings_member_forbidden(env, shared, path, body):
    response = env.client.patch(f"/api/households/{shared.house['id']}/{path}", json=body, headers=shared.hb)
    assert response.status_code == 403


@pytest.mark.parametrize("weekday", [0, 8, -1])
def test_rewards_weekday_out_of_range_400(env, shared, weekday):
    response = env.client.patch(
        f"/api/households/{shared.house['id']}/rewards-settings", json={"weekday": weekday}, headers=shared.ha
    )
    assert response.status_code == 400


def test_rewards_settings_partial_update(env, shared):
    url = f"/api/households/{shared.house['id']}/rewards-settings"
    env.client.patch(url, json={"weekday": 1}, headers=shared.ha)
    detail = env.client.patch(url, json={"enabled": False}, headers=shared.ha).json()
    assert (detail["rewards_summary_weekday"], detail["rewards_enabled"]) == (1, False)


@pytest.mark.xfail(
    strict=True,
    reason="BUG : chores_enabled=False n'est vérifié par aucun endpoint de chore_service "
           "(seul household_service le stocke) -- même défaut que loans_enabled",
)
def test_disabled_chores_module_refuses_access(env, shared):
    env.client.patch(f"/api/households/{shared.house['id']}/rewards-settings",
                     json={"chores_enabled": False}, headers=shared.ha)
    _switch(env, shared.ha, shared.house["id"])
    assert env.client.post("/api/chores", json={"name": "X"}, headers=shared.ha).status_code in (403, 404)


# ==================== DÉPART / RETRAIT / SUPPRESSION ====================

def test_member_leave_resets_active_household(env, shared):
    _switch(env, shared.hb, shared.house["id"])
    assert env.client.post(f"/api/households/{shared.house['id']}/leave", headers=shared.hb).status_code == 200
    me = env.client.get("/api/auth/me", headers=shared.hb).json()
    assert me["active_household_id"] == shared.personal_b.id
    assert env.client.get(f"/api/households/{shared.house['id']}", headers=shared.hb).status_code == 403


def test_sole_admin_cannot_leave(env, shared):
    response = env.client.post(f"/api/households/{shared.house['id']}/leave", headers=shared.ha)
    assert response.status_code == 400


@pytest.mark.xfail(
    strict=True,
    reason="BUG : leave_household (household_service.py:362-368) utilise scalar_one_or_none() pour "
           "chercher « un autre admin » -> MultipleResultsFound (500) dès qu'il existe 2+ autres admins",
)
def test_admin_can_leave_when_several_other_admins(env, shared):
    carol, _ = env.make_user("carol")
    env.add_member(carol, env.db.get(models.Household, shared.house["id"]), role="admin", activate=False)
    membership = env.db.query(models.HouseholdMember).filter_by(
        household_id=shared.house["id"], user_id=shared.bob.id).one()
    membership.role = "admin"
    env.db.commit()
    response = env.client.post(f"/api/households/{shared.house['id']}/leave", headers=shared.ha)
    assert response.status_code == 200, response.text


def test_personal_household_cannot_be_left_or_deleted(env, shared):
    pid = shared.personal_a.id
    assert env.client.post(f"/api/households/{pid}/leave", headers=shared.ha).status_code == 400
    assert env.client.delete(f"/api/households/{pid}", headers=shared.ha).status_code == 400


def test_admin_removes_member(env, shared):
    _switch(env, shared.hb, shared.house["id"])
    url = f"/api/households/{shared.house['id']}/members/{shared.bob.id}"
    assert env.client.delete(url, headers=shared.ha).status_code == 200
    me = env.client.get("/api/auth/me", headers=shared.hb).json()
    assert me["active_household_id"] == shared.personal_b.id
    # Bob ne voit plus les données du foyer
    assert env.client.get("/api/products", headers=shared.hb).json() == []


def test_member_cannot_remove_admin(env, shared):
    url = f"/api/households/{shared.house['id']}/members/{shared.alice.id}"
    assert env.client.delete(url, headers=shared.hb).status_code == 403


def test_remove_self_or_unknown_member(env, shared):
    base = f"/api/households/{shared.house['id']}/members"
    assert env.client.delete(f"{base}/{shared.alice.id}", headers=shared.ha).status_code == 400
    assert env.client.delete(f"{base}/inconnu", headers=shared.ha).status_code == 404


def test_delete_household_resets_members_and_removes_data(env, shared):
    _switch(env, shared.ha, shared.house["id"])
    _switch(env, shared.hb, shared.house["id"])
    env.client.post("/api/products", json={"name": "Lait"}, headers=shared.ha)
    assert env.client.delete(f"/api/households/{shared.house['id']}", headers=shared.hb).status_code == 403
    assert env.client.delete(f"/api/households/{shared.house['id']}", headers=shared.ha).status_code == 200
    for headers, personal in [(shared.ha, shared.personal_a), (shared.hb, shared.personal_b)]:
        assert env.client.get("/api/auth/me", headers=headers).json()["active_household_id"] == personal.id
        assert env.client.get("/api/products", headers=headers).json() == []
    env.db.expire_all()
    assert env.db.query(models.Product).count() == 0


def test_unknown_household_endpoints_return_403_not_500(env, shared):
    """Un identifiant de foyer inexistant doit être refusé proprement."""
    for method, path in [("get", "/api/households/inconnu"), ("post", "/api/households/inconnu/leave"),
                         ("delete", "/api/households/inconnu")]:
        assert getattr(env.client, method)(path, headers=shared.ha).status_code == 403, path


# ==================== BASCULE / ISOLATION ====================

def test_switch_shows_shared_data_to_both_members(env, shared):
    _switch(env, shared.ha, shared.house["id"])
    _switch(env, shared.hb, shared.house["id"])
    env.client.post("/api/products", json={"name": "Commun"}, headers=shared.ha)
    assert [p["name"] for p in env.client.get("/api/products", headers=shared.hb).json()] == ["Commun"]
    _switch(env, shared.hb, shared.personal_b.id)
    assert env.client.get("/api/products", headers=shared.hb).json() == []


def test_list_households_only_mine(env, shared):
    carol, _ = env.make_user("carol")
    names = [h["name"] for h in env.client.get("/api/households", headers=env.headers(carol)).json()]
    assert names == ["Foyer carol"]
    assert len(env.client.get("/api/households", headers=shared.hb).json()) == 2


def test_members_list_of_other_household_forbidden(env, shared):
    carol, _ = env.make_user("carol")
    response = env.client.get(f"/api/households/{shared.house['id']}/members", headers=env.headers(carol))
    assert response.status_code == 403


def test_transfer_stock_moves_everything(env, shared):
    ha = shared.ha
    env.client.post("/api/categories", json={"name": "Frais"}, headers=ha)
    env.client.post("/api/products", json={"name": "Lait"}, headers=ha)
    env.client.post("/api/shopping-list", json={"name": "Pain"}, headers=ha)
    response = env.client.post(f"/api/households/{shared.house['id']}/transfer-stock", headers=ha)
    assert response.status_code == 200
    assert env.client.get("/api/products", headers=ha).json() == []
    _switch(env, ha, shared.house["id"])
    assert [p["name"] for p in env.client.get("/api/products", headers=ha).json()] == ["Lait"]
    assert [c["name"] for c in env.client.get("/api/categories", headers=ha).json()] == ["Frais"]
    assert [i["name"] for i in env.client.get("/api/shopping-list", headers=ha).json()] == ["Pain"]


# ==================== SUPPRESSION D'UN COMPTE (admin appli) ====================

@pytest.mark.xfail(
    strict=True,
    reason="BUG perte de données : supprimer un compte (auth_service.delete_user, l.582) supprime en "
           "cascade (users.id ON DELETE CASCADE + relationship cascade delete-orphan, models.py:61-65) "
           "les produits/catégories qu'il a créés dans un foyer PARTAGÉ, au détriment des autres membres",
)
def test_deleting_user_keeps_shared_household_products(env, shared):
    root, _ = env.make_user("root", role="admin")
    _switch(env, shared.hb, shared.house["id"])
    _switch(env, shared.ha, shared.house["id"])
    env.client.post("/api/products", json={"name": "Lait de Bob"}, headers=shared.hb)
    assert env.client.delete(f"/api/auth/users/{shared.bob.id}", headers=env.headers(root)).status_code == 200
    assert [p["name"] for p in env.client.get("/api/products", headers=shared.ha).json()] == ["Lait de Bob"]
