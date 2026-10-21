"""Tests des tâches ménagères / récompenses (chore_service) : logique pure de
planification, exécution / passage / annulation, rotation des assignés,
récapitulatif des récompenses, validation et isolation."""

# pylint: disable=redefined-outer-name,protected-access

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import chore_service
import models

# Mercredi 21 octobre 2026, 10:00 UTC
NOW = datetime(2026, 10, 21, 10, 0, tzinfo=timezone.utc)


def _chore(**fields):
    base = {"period_type": "manually", "period_hours": None, "period_days": None, "weekdays": None,
            "month_days": None, "yearly_month": None, "yearly_day": None, "due_time": None}
    base.update(fields)
    return SimpleNamespace(**base)


# ==================== LOGIQUE PURE ====================

@pytest.mark.parametrize("fields, expected", [
    ({"period_type": "manually"}, None),
    ({"period_type": "hourly", "period_hours": 3}, NOW + timedelta(hours=3)),
    ({"period_type": "hourly"}, NOW + timedelta(hours=1)),
    ({"period_type": "daily", "period_days": 2}, NOW + timedelta(days=2)),
    ({"period_type": "daily", "due_time": "06:30"}, datetime(2026, 10, 22, 6, 30, tzinfo=timezone.utc)),
    # hebdo : lundi(1) et vendredi(5) -> prochain = vendredi 23
    ({"period_type": "weekly", "weekdays": "1,5"}, datetime(2026, 10, 23, 10, 0, tzinfo=timezone.utc)),
    # hebdo même jour de semaine (mercredi) -> +7 jours, jamais aujourd'hui
    ({"period_type": "weekly", "weekdays": "3"}, NOW + timedelta(days=7)),
    ({"period_type": "biweekly"}, NOW + timedelta(days=14)),
    ({"period_type": "monthly", "month_days": "1"}, datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)),
    ({"period_type": "yearly", "yearly_month": 2, "yearly_day": 29}, datetime(2027, 2, 28, 10, 0, tzinfo=timezone.utc)),
    ({"period_type": "yearly", "yearly_month": 10, "yearly_day": 21}, datetime(2027, 10, 21, 10, 0, tzinfo=timezone.utc)),
])
def test_compute_next_due(fields, expected):
    assert chore_service._compute_next_due(_chore(**fields), NOW) == expected


def test_monthly_31_skips_short_months():
    nxt = chore_service._compute_next_due(_chore(period_type="monthly", month_days="31"), NOW)
    assert nxt.date().isoformat() == "2026-10-31"
    nxt2 = chore_service._compute_next_due(_chore(period_type="monthly", month_days="31"), nxt)
    assert nxt2.date().isoformat() == "2026-12-31"  # novembre (30 j) est sauté


@pytest.mark.parametrize("weekday, expected_day", [(3, 21), (1, 19), (7, 18), (4, 15)])
def test_period_start(weekday, expected_day):
    start = chore_service._period_start(weekday, NOW)
    assert (start.day, start.hour, start.minute) == (expected_day, 0, 0)


@pytest.mark.parametrize("next_due, done_until, expected", [
    (None, None, "no_schedule"),
    (NOW - timedelta(minutes=1), None, "overdue"),
    (NOW + timedelta(hours=5), None, "due_today"),
    (NOW + timedelta(days=2), None, "due_soon"),
    (NOW + timedelta(days=3), None, "upcoming"),
    (NOW - timedelta(days=1), NOW + timedelta(hours=1), "done"),
])
def test_compute_status(next_due, done_until, expected):
    assert chore_service._compute_status(next_due, done_until, NOW) == expected


# ==================== API ====================

@pytest.fixture
def trio(env):
    """Foyer d'Alice partagé avec Bob et Carol (tous actifs dessus)."""
    alice, house = env.make_user("alice")
    bob, _ = env.make_user("bob")
    carol, _ = env.make_user("carol")
    env.add_member(bob, house)
    env.add_member(carol, house)
    return SimpleNamespace(alice=alice, bob=bob, carol=carol, house=house,
                           ha=env.headers(alice), hb=env.headers(bob), hc=env.headers(carol))


def _create(env, headers, **payload):
    payload.setdefault("name", "Vaisselle")
    response = env.client.post("/api/chores", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("payload", [
    {"period_type": "toujours"},
    {"assignment_type": "moi"},
    {"due_time": "24:00"},
    {"due_time": "7h"},
    {"reward": -1},
])
def test_create_invalid_values_400(env, trio, payload):
    response = env.client.post("/api/chores", json={"name": "X", **payload}, headers=trio.ha)
    assert response.status_code == 400, response.text


@pytest.mark.xfail(
    strict=True,
    reason="BUG : yearly_month/yearly_day non validés : yearly_month=13 -> calendar.monthrange lève "
           "ValueError dans _safe_date (chore_service.py:63) -> 500 ; yearly_day=0 accepté puis remplacé "
           "silencieusement par le jour courant (`or from_dt.day`, chore_service.py:120)",
)
@pytest.mark.parametrize("month, day", [(13, 1), (2, 0)])
def test_create_yearly_invalid_date_rejected(env, trio, month, day):
    response = env.client.post(
        "/api/chores", json={"name": "X", "period_type": "yearly", "yearly_month": month, "yearly_day": day},
        headers=trio.ha,
    )
    assert response.status_code in (400, 422), response.text


@pytest.mark.xfail(
    strict=True,
    reason="BUG : PUT /chores/{id} avec name/period_type/assignment_type = null -> setattr(None) sur "
           "colonne NOT NULL -> 500 (chore_service.update_chore, exclude_unset sans filtrage)",
)
@pytest.mark.parametrize("field", ["name", "period_type", "assignment_type"])
def test_update_null_required_field_does_not_500(env, trio, field):
    chore = _create(env, trio.ha)
    response = env.client.put(f"/api/chores/{chore['id']}", json={field: None}, headers=trio.ha)
    assert response.status_code < 500, response.text


def test_alphabetical_rotation(env, trio):
    chore = _create(env, trio.ha, assignment_type="in-alphabetical-order")
    assert chore["assigned_user_id"] == trio.alice.id
    seq = []
    for _ in range(4):
        seq.append(env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha).json()["chore"]["assigned_user_id"])
    assert seq == [trio.bob.id, trio.carol.id, trio.alice.id, trio.bob.id]


def test_eligible_users_restrict_rotation(env, trio):
    chore = _create(env, trio.ha, assignment_type="in-alphabetical-order",
                    eligible_user_ids=[trio.carol.id])
    for _ in range(2):
        result = env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha).json()
        assert result["chore"]["assigned_user_id"] == trio.carol.id


@pytest.mark.xfail(
    strict=True,
    reason="BUG : execute_chore calcule le prochain assigné (chore_service.py:564) AVANT d'ajouter le "
           "log de l'exécution courante (l.578) : en mode who-least-did-first, l'exécutant n'est pas "
           "compté et peut être réassigné immédiatement",
)
def test_who_least_did_first(env, trio):
    chore = _create(env, trio.ha, assignment_type="who-least-did-first")
    env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha)  # alice:1
    nxt = env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.hb).json()  # bob:1
    names = {trio.alice.id: "alice", trio.bob.id: "bob", trio.carol.id: "carol"}
    # alice=1, bob=1, carol=0 -> carol attendue
    assert names[nxt["chore"]["assigned_user_id"]] == "carol"


def test_execute_then_undo_restores_state(env, trio):
    chore = _create(env, trio.ha, period_type="daily", assignment_type="in-alphabetical-order")
    executed = env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.hb).json()
    assert executed["chore"]["status"] == "done"
    assert env.client.delete(f"/api/chores/logs/{executed['log']['id']}", headers=trio.ha).status_code == 200
    restored = env.client.get(f"/api/chores/{chore['id']}", headers=trio.ha).json()
    assert restored["next_due_at"] == chore["next_due_at"]
    assert restored["assigned_user_id"] == chore["assigned_user_id"]
    assert restored["last_done_at"] is None


def test_undo_only_latest_log(env, trio):
    chore = _create(env, trio.ha)
    first = env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha).json()["log"]
    env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha)
    assert env.client.delete(f"/api/chores/logs/{first['id']}", headers=trio.ha).status_code == 400


def test_skip_manual_chore_400(env, trio):
    chore = _create(env, trio.ha)
    assert env.client.post(f"/api/chores/{chore['id']}/skip", headers=trio.ha).status_code == 400


def test_skip_moves_due_date_without_reward(env, trio):
    chore = _create(env, trio.ha, period_type="daily", reward=2)
    skipped = env.client.post(f"/api/chores/{chore['id']}/skip", headers=trio.ha).json()
    assert skipped["log"]["skipped"] is True
    assert skipped["log"]["reward_amount"] is None
    assert skipped["chore"]["next_due_at"] > chore["next_due_at"]
    summary = env.client.get("/api/chores/rewards/summary", headers=trio.ha).json()
    assert all(m["total_all_time"] == 0 for m in summary["members"])


def test_rewards_summary(env, trio):
    chore = _create(env, trio.ha, reward=1.5)
    env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.hb)
    env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.hb)
    summary = env.client.get("/api/chores/rewards/summary", headers=trio.ha).json()
    by_user = {m["username"]: m for m in summary["members"]}
    assert by_user["bob"]["total_all_time"] == 3.0
    assert by_user["bob"]["total_current_period"] == 3.0
    assert by_user["alice"]["total_all_time"] == 0
    assert len(by_user["bob"]["logs"]) == 2


def test_reward_amount_frozen_at_execution(env, trio):
    chore = _create(env, trio.ha, reward=1)
    env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.hb)
    env.client.put(f"/api/chores/{chore['id']}", json={"reward": 10}, headers=trio.ha)
    summary = env.client.get("/api/chores/rewards/summary", headers=trio.ha).json()
    assert {m["username"]: m["total_all_time"] for m in summary["members"]}["bob"] == 1.0


def test_removed_member_never_reassigned(env, trio):
    chore = _create(env, trio.ha, assignment_type="in-alphabetical-order")
    membership = env.db.query(models.HouseholdMember).filter_by(
        household_id=trio.house.id, user_id=trio.bob.id).one()
    env.db.delete(membership)
    env.db.commit()
    nxt = env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha).json()["chore"]
    assert nxt["assigned_user_id"] == trio.carol.id


# ==================== ISOLATION ====================

def test_chore_isolation_other_household(env, trio):
    dave, _ = env.make_user("dave")
    hd = env.headers(dave)
    chore = _create(env, trio.ha, reward=5)
    log = env.client.post(f"/api/chores/{chore['id']}/execute", headers=trio.ha).json()["log"]
    for method, path in [
        ("get", f"/api/chores/{chore['id']}"), ("put", f"/api/chores/{chore['id']}"),
        ("delete", f"/api/chores/{chore['id']}"), ("post", f"/api/chores/{chore['id']}/execute"),
        ("post", f"/api/chores/{chore['id']}/skip"), ("get", f"/api/chores/{chore['id']}/logs"),
        ("delete", f"/api/chores/logs/{log['id']}"),
    ]:
        kwargs = {"json": {"name": "pirate"}} if method == "put" else {}
        assert getattr(env.client, method)(path, headers=hd, **kwargs).status_code == 404, path
    summary = env.client.get("/api/chores/rewards/summary", headers=hd).json()
    assert [m["username"] for m in summary["members"]] == ["dave"]
    assert env.client.get("/api/chores/calendar", headers=hd).json() == []


@pytest.mark.xfail(
    strict=True,
    reason="BUG critique (DoS) : period_hours/period_days négatifs acceptés (aucune validation, "
           "chore_service.create_chore) ; _compute_next_due recule alors dans le temps et la boucle "
           "while de GET /chores/calendar (chore_service.py:423-426) ne termine jamais",
)
@pytest.mark.parametrize("payload", [
    {"period_type": "hourly", "period_hours": -1},
    {"period_type": "daily", "period_days": -1},
])
def test_negative_period_rejected(env, trio, payload):
    response = env.client.post("/api/chores", json={"name": "X", **payload}, headers=trio.ha)
    assert response.status_code in (400, 422), response.text


@pytest.mark.parametrize("fields", [
    {"period_type": "hourly", "period_hours": -1},
    {"period_type": "daily", "period_days": -1},
])
def test_negative_period_goes_backwards_in_time(fields):
    """Preuve unitaire du défaut ci-dessus (sans appeler /calendar, qui bouclerait)."""
    assert chore_service._compute_next_due(_chore(**fields), NOW) < NOW
