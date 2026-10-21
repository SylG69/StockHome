"""Tests du module Emprunts médiathèque (loan_service) : logique pure,
CRUD, isolation entre foyers, auth, validation et recherche externe."""

# Idiomes pytest (fixtures en paramètre, test des helpers privés `_xxx`).
# pylint: disable=redefined-outer-name,protected-access,too-few-public-methods

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import loan_service
import models

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)


# ==================== LOGIQUE PURE ====================

@pytest.mark.parametrize(
    "due_delta, returned, expected",
    [
        (timedelta(days=-1), None, "overdue"),
        (timedelta(seconds=-1), None, "overdue"),
        (timedelta(0), None, "due_soon"),
        (timedelta(days=3), None, "due_soon"),
        (timedelta(days=3, seconds=1), None, "borrowed"),
        (timedelta(days=30), None, "borrowed"),
        (timedelta(days=-10), NOW, "returned"),
        (timedelta(days=10), NOW, "returned"),
    ],
)
def test_compute_status(due_delta, returned, expected):
    assert loan_service._compute_status(NOW + due_delta, returned, NOW) == expected


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("978-2-07-036822-8", "9782070368228"),
        (" 978 2070 368228 ", "9782070368228"),
        ("abc", ""),
        ("", ""),
        ("٣٤٥", ""),  # chiffres arabo-indiens : \D en Python les considère comme chiffres ? voir assertion
    ],
)
def test_normalize_barcode(raw, expected):
    result = loan_service._normalize_barcode(raw)
    # \d de `re` (str) accepte les chiffres Unicode : on vérifie a minima que
    # le résultat ne contient que des chiffres ASCII pour un code-barres.
    if raw == "٣٤٥":
        pytest.xfail(
            "BUG mineur : _normalize_barcode (loan_service.py:33) garde les chiffres "
            f"Unicode non ASCII ({result!r}) -- utiliser [^0-9] ou re.ASCII"
        )
    assert result == expected


def test_compute_due_at_uses_type_specific_duration():
    household = SimpleNamespace(loan_book_duration_days=21, loan_game_duration_days=14)
    assert loan_service._compute_due_at(household, "book", NOW) == NOW + timedelta(days=21)
    assert loan_service._compute_due_at(household, "videogame", NOW) == NOW + timedelta(days=14)


# ==================== HELPERS ====================

def _create(env, user, **overrides):
    payload = {"type": "book", "title": "Le Petit Prince"}
    payload.update(overrides)
    return env.client.post("/api/loans", json=payload, headers=env.headers(user))


@pytest.fixture
def two_households(env):
    """Deux utilisateurs, chacun dans son foyer, et un emprunt dans le foyer A."""
    alice, house_a = env.make_user("alice")
    bob, house_b = env.make_user("bob")
    response = _create(env, alice, title="Livre d'Alice")
    assert response.status_code == 200, response.text
    return SimpleNamespace(alice=alice, bob=bob, house_a=house_a, house_b=house_b, loan=response.json())


# ==================== CRUD NOMINAL ====================

def test_create_book_computes_due_at_from_household(env):
    alice, house = env.make_user("alice")
    borrowed = "2026-10-01T00:00:00+00:00"
    response = _create(env, alice, borrowed_at=borrowed, barcode="978-2-07-036822-8")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["household_id"] == house.id
    assert body["user_id"] == alice.id
    assert body["barcode"] == "9782070368228"
    assert datetime.fromisoformat(body["due_at"]) == datetime(2026, 10, 22, tzinfo=timezone.utc)


def test_create_videogame_uses_game_duration(env):
    alice, house = env.make_user("alice")
    house = env.db.get(models.Household, house.id)
    house.loan_game_duration_days = 7
    env.db.commit()
    response = _create(env, alice, type="videogame", title="Zelda", borrowed_at="2026-10-01T00:00:00Z")
    assert response.status_code == 200, response.text
    assert datetime.fromisoformat(response.json()["due_at"]) == datetime(2026, 10, 8, tzinfo=timezone.utc)


def test_create_with_explicit_due_at_is_kept(env):
    alice, _ = env.make_user("alice")
    response = _create(env, alice, borrowed_at="2026-10-01T00:00:00Z", due_at="2026-12-25T00:00:00Z")
    assert datetime.fromisoformat(response.json()["due_at"]) == datetime(2026, 12, 25, tzinfo=timezone.utc)


def test_create_unicode_title(env):
    alice, _ = env.make_user("alice")
    response = _create(env, alice, title="Les Misérables 📚 — 東京")
    assert response.status_code == 200
    assert response.json()["title"] == "Les Misérables 📚 — 東京"


def test_list_sorted_by_due_at(env):
    alice, _ = env.make_user("alice")
    _create(env, alice, title="Tard", due_at="2027-01-01T00:00:00Z")
    _create(env, alice, title="Tôt", due_at="2026-11-01T00:00:00Z")
    titles = [loan["title"] for loan in env.client.get("/api/loans", headers=env.headers(alice)).json()]
    assert titles == ["Tôt", "Tard"]


def test_status_overdue_on_list(env):
    alice, _ = env.make_user("alice")
    _create(env, alice, borrowed_at="2020-01-01T00:00:00Z")
    assert env.client.get("/api/loans", headers=env.headers(alice)).json()[0]["status"] == "overdue"


def test_update_and_return_and_delete(env):
    alice, _ = env.make_user("alice")
    loan_id = _create(env, alice).json()["id"]
    headers = env.headers(alice)

    response = env.client.put(f"/api/loans/{loan_id}", json={"title": "Vol de nuit", "barcode": "12-34"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Vol de nuit"
    assert response.json()["barcode"] == "1234"

    response = env.client.post(f"/api/loans/{loan_id}/return", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "returned"
    assert response.json()["returned_at"] is not None

    response = env.client.post(f"/api/loans/{loan_id}/return", headers=headers)
    assert response.status_code == 400

    assert env.client.delete(f"/api/loans/{loan_id}", headers=headers).status_code == 200
    assert env.client.get(f"/api/loans/{loan_id}", headers=headers).status_code == 404


# ==================== ISOLATION ENTRE FOYERS ====================

def test_isolation_list(env, two_households):
    ctx = two_households
    assert env.client.get("/api/loans", headers=env.headers(ctx.bob)).json() == []


@pytest.mark.parametrize(
    "method, suffix, body",
    [
        ("get", "", None),
        ("put", "", {"title": "Piraté"}),
        ("delete", "", None),
        ("post", "/return", None),
    ],
)
def test_isolation_other_household_returns_404(env, two_households, method, suffix, body):
    ctx = two_households
    kwargs = {"headers": env.headers(ctx.bob)}
    if body is not None:
        kwargs["json"] = body
    response = getattr(env.client, method)(f"/api/loans/{ctx.loan['id']}{suffix}", **kwargs)
    assert response.status_code == 404
    # l'emprunt d'Alice n'a pas été modifié / supprimé / rendu
    loan = env.client.get(f"/api/loans/{ctx.loan['id']}", headers=env.headers(ctx.alice)).json()
    assert loan["title"] == "Livre d'Alice"
    assert loan["returned_at"] is None


def test_isolation_follows_active_household(env, two_households):
    """Bob rejoint le foyer A : il voit l'emprunt ; revenu sur son foyer, il ne le voit plus."""
    ctx = two_households
    env.add_member(ctx.bob, ctx.house_a, activate=True)
    assert len(env.client.get("/api/loans", headers=env.headers(ctx.bob)).json()) == 1
    bob = env.db.get(models.User, ctx.bob.id)
    bob.active_household_id = ctx.house_b.id
    env.db.commit()
    assert env.client.get("/api/loans", headers=env.headers(ctx.bob)).json() == []


def test_isolation_stale_active_household_falls_back_to_personal(env, two_households):
    """active_household_id pointant vers un foyer dont Bob n'est pas membre : repli sur son foyer perso."""
    ctx = two_households
    bob = env.db.get(models.User, ctx.bob.id)
    bob.active_household_id = ctx.house_a.id
    env.db.commit()
    assert env.client.get("/api/loans", headers=env.headers(ctx.bob)).json() == []
    response = env.client.get(f"/api/loans/{ctx.loan['id']}", headers=env.headers(ctx.bob))
    assert response.status_code == 404


def test_create_cannot_force_household_id(env, two_households):
    """Un household_id fourni dans le corps est ignoré (champ absent du schéma)."""
    ctx = two_households
    response = _create(env, ctx.bob, household_id=ctx.house_a.id, user_id=ctx.alice.id)
    assert response.status_code == 200
    assert response.json()["household_id"] == ctx.house_b.id
    assert response.json()["user_id"] == ctx.bob.id


# ==================== AUTH ====================

def test_requires_token(env):
    assert env.client.get("/api/loans").status_code in (401, 403)


def test_invalid_token(env):
    response = env.client.get("/api/loans", headers={"Authorization": "Bearer pas-un-jwt"})
    assert response.status_code == 401


@pytest.mark.parametrize("status", ["pending", "disabled"])
@pytest.mark.parametrize(
    "method, path",
    [("get", "/api/loans"), ("post", "/api/loans"), ("get", "/api/loans/lookup/book/9782070368228")],
)
def test_pending_or_disabled_user_refused(env, status, method, path):
    user, _ = env.make_user("carol", status=status)
    kwargs = {"headers": env.headers(user)}
    if method == "post":
        kwargs["json"] = {"type": "book", "title": "X"}
    assert getattr(env.client, method)(path, **kwargs).status_code == 403


# ==================== VALIDATION ====================

def test_create_invalid_type_rejected(env):
    alice, _ = env.make_user("alice")
    assert _create(env, alice, type="dvd").status_code == 400


@pytest.mark.parametrize("payload", [{"type": "book"}, {"title": "X"}, {}])
def test_create_missing_required_fields_422(env, payload):
    alice, _ = env.make_user("alice")
    response = env.client.post("/api/loans", json=payload, headers=env.headers(alice))
    assert response.status_code == 422


def test_update_invalid_type_rejected(env):
    alice, _ = env.make_user("alice")
    loan_id = _create(env, alice).json()["id"]
    response = env.client.put(f"/api/loans/{loan_id}", json={"type": "dvd"}, headers=env.headers(alice))
    assert response.status_code == 400


@pytest.mark.xfail(strict=True, reason="BUG : titre vide accepté (aucune contrainte min_length dans schemas.LoanBase)")
def test_create_empty_title_rejected(env):
    alice, _ = env.make_user("alice")
    assert _create(env, alice, title="   ").status_code in (400, 422)


def test_create_null_notes_uses_default(env):
    """notes=null en création : l'ORM omet la valeur None et applique default=''."""
    alice, _ = env.make_user("alice")
    response = _create(env, alice, notes=None)
    assert response.status_code == 200
    assert response.json()["notes"] in ("", None)


@pytest.mark.xfail(
    strict=True,
    reason="BUG : PUT avec title/type/due_at/notes = null -> setattr(None) sur colonne NOT NULL -> 500 "
    "(loan_service.update_loan, boucle setattr sans filtrage des None)",
)
@pytest.mark.parametrize("field", ["title", "type", "due_at", "notes"])
def test_update_null_required_field_does_not_500(env, field):
    alice, _ = env.make_user("alice")
    loan_id = _create(env, alice).json()["id"]
    response = env.client.put(f"/api/loans/{loan_id}", json={field: None}, headers=env.headers(alice))
    assert response.status_code != 500


@pytest.mark.xfail(strict=True, reason="BUG : due_at antérieure à borrowed_at acceptée sans contrôle")
def test_create_due_before_borrowed_rejected(env):
    alice, _ = env.make_user("alice")
    response = _create(env, alice, borrowed_at="2026-10-10T00:00:00Z", due_at="2026-10-01T00:00:00Z")
    assert response.status_code in (400, 422)


@pytest.mark.xfail(
    strict=True,
    reason="BUG (PostgreSQL) : aucune max_length côté schéma ; title > 255 ou barcode > 20 chiffres "
    "-> StringDataRightTruncation -> 500 sur PG (SQLite n'applique pas la longueur, d'où 200 ici)",
)
@pytest.mark.parametrize("field, value", [("title", "x" * 300), ("barcode", "1" * 25)])
def test_create_too_long_values_rejected(env, field, value):
    alice, _ = env.make_user("alice")
    assert _create(env, alice, **{field: value}).status_code in (400, 422)


def test_create_naive_datetimes_accepted(env):
    """Le frontend envoie `YYYY-MM-DDT00:00:00` sans fuseau : ne doit pas faire planter le statut."""
    alice, _ = env.make_user("alice")
    response = _create(env, alice, borrowed_at="2026-10-01T00:00:00", due_at="2026-10-22T00:00:00")
    assert response.status_code == 200, response.text
    assert response.json()["status"] in {"overdue", "due_soon", "borrowed"}


def test_unknown_loan_id_404(env):
    alice, _ = env.make_user("alice")
    assert env.client.get("/api/loans/inexistant", headers=env.headers(alice)).status_code == 404


# ==================== ACTIVATION DU MODULE ====================

@pytest.mark.xfail(
    strict=True,
    reason="BUG : loans_enabled=False n'est vérifié par aucun endpoint de loan_service "
    "(seul le menu frontend est masqué, Layout.jsx:41)",
)
def test_disabled_module_refuses_access(env):
    alice, house = env.make_user("alice")
    house = env.db.get(models.Household, house.id)
    house.loans_enabled = False
    env.db.commit()
    assert _create(env, alice).status_code in (403, 404)


# ==================== RÉGLAGES DU FOYER (household_service) ====================

@pytest.mark.parametrize("field", ["loan_book_duration_days", "loan_game_duration_days"])
@pytest.mark.parametrize("value", [0, -5])
def test_loans_settings_reject_non_positive(env, field, value):
    alice, house = env.make_user("alice")
    response = env.client.patch(
        f"/api/households/{house.id}/loans-settings", json={field: value}, headers=env.headers(alice)
    )
    assert response.status_code == 400


def test_loans_settings_member_not_admin_forbidden(env):
    alice, _ = env.make_user("alice")
    bob, _ = env.make_user("bob")
    shared = models.Household(name="Partagé", is_personal=False)
    env.db.add(shared)
    env.db.commit()
    env.add_member(alice, shared, role="admin")
    env.add_member(bob, shared, role="member")
    response = env.client.patch(
        f"/api/households/{shared.id}/loans-settings", json={"loan_book_duration_days": 30}, headers=env.headers(bob)
    )
    assert response.status_code == 403


def test_loans_settings_other_household_forbidden(env):
    alice, _ = env.make_user("alice")
    _, house_b = env.make_user("bob")
    response = env.client.patch(
        f"/api/households/{house_b.id}/loans-settings", json={"enabled": False}, headers=env.headers(alice)
    )
    assert response.status_code == 403
    assert env.db.get(models.Household, house_b.id).loans_enabled is True


def test_loans_settings_applied_to_new_loans(env):
    alice, house = env.make_user("alice")
    response = env.client.patch(
        f"/api/households/{house.id}/loans-settings", json={"loan_book_duration_days": 30}, headers=env.headers(alice)
    )
    assert response.status_code == 200
    assert response.json()["loan_book_duration_days"] == 30
    loan = _create(env, alice, borrowed_at="2026-10-01T00:00:00Z").json()
    assert datetime.fromisoformat(loan["due_at"]) == datetime(2026, 10, 31, tzinfo=timezone.utc)


# ==================== RECHERCHE EXTERNE (mockée) ====================

def _fake_source(result, name):
    async def _fetch(_isbn):
        return (result, name) if result else (None, None)
    return _fetch


def test_lookup_book_cascade_completes_missing_cover(env, monkeypatch):
    alice, _ = env.make_user("alice")
    monkeypatch.setattr(
        loan_service,
        "BOOK_SOURCES",
        [
            ("BnF", _fake_source({"title": "T", "author": "A", "publisher": "P", "cover_url": None}, "BnF")),
            ("Open Library", _fake_source(None, None)),
            ("Google Books", _fake_source({"title": "Autre", "cover_url": "http://img"}, "Google Books")),
        ],
    )
    response = env.client.get("/api/loans/lookup/book/978-2-07", headers=env.headers(alice))
    assert response.status_code == 200
    body = response.json()
    assert body == {"title": "T", "author": "A", "publisher": "P", "cover_url": "http://img", "source": "BnF"}
    logs = env.db.query(models.ApiCallLog).all()
    assert sorted((log.source, log.success) for log in logs) == [
        ("BnF", True), ("Google Books", True), ("Open Library", False)
    ]


def test_lookup_book_stops_at_first_complete_result(env, monkeypatch):
    alice, _ = env.make_user("alice")
    calls = []

    def _tracking(name, result):
        async def _fetch(_isbn):
            calls.append(name)
            return (result, name) if result else (None, None)
        return _fetch

    monkeypatch.setattr(
        loan_service,
        "BOOK_SOURCES",
        [
            ("BnF", _tracking("BnF", {"title": "T", "cover_url": "http://c"})),
            ("Open Library", _tracking("Open Library", {"title": "X"})),
        ],
    )
    assert env.client.get("/api/loans/lookup/book/1", headers=env.headers(alice)).status_code == 200
    assert calls == ["BnF"]


def test_lookup_book_not_found_404(env, monkeypatch):
    alice, _ = env.make_user("alice")
    monkeypatch.setattr(loan_service, "BOOK_SOURCES", [("BnF", _fake_source(None, None))])
    assert env.client.get("/api/loans/lookup/book/123", headers=env.headers(alice)).status_code == 404


def test_lookup_videogame_not_found_404(env, monkeypatch):
    alice, _ = env.make_user("alice")

    async def _none(_barcode):
        return None, None

    monkeypatch.setattr(loan_service, "_fetch_wikidata_videogame", _none)
    assert env.client.get("/api/loans/lookup/videogame/123", headers=env.headers(alice)).status_code == 404


def test_lookup_videogame_barcode_is_sanitized_before_sparql(env, monkeypatch):
    """Le code-barres est réduit aux chiffres avant d'être interpolé dans la requête SPARQL."""
    alice, _ = env.make_user("alice")
    seen = []

    async def _spy(barcode):
        seen.append(barcode)
        return {"title": "Jeu", "author": "Switch", "publisher": None, "cover_url": None}, "Wikidata"

    monkeypatch.setattr(loan_service, "_fetch_wikidata_videogame", _spy)
    response = env.client.get(
        '/api/loans/lookup/videogame/123"%20%7D%20UNION%20%7B', headers=env.headers(alice)
    )
    assert response.status_code == 200
    assert seen == ["123"]


@pytest.mark.xfail(
    strict=True,
    reason="BUG mineur : code vide après nettoyage ('abc') -> appels externes inutiles au lieu d'un 400",
)
def test_lookup_book_non_numeric_rejected_without_external_call(env, monkeypatch):
    alice, _ = env.make_user("alice")
    calls = []

    async def _fetch(isbn):
        calls.append(isbn)
        return None, None

    monkeypatch.setattr(loan_service, "BOOK_SOURCES", [("BnF", _fetch)])
    response = env.client.get("/api/loans/lookup/book/abc", headers=env.headers(alice))
    assert response.status_code == 400
    assert not calls


# ==================== PARSEURS DES SOURCES (httpx mocké) ====================


@pytest.fixture
def anyio_backend():
    """Les fetchers async sont exécutés sous asyncio."""
    return "asyncio"


class _FakeResponse:
    def __init__(self, status_code=200, content=b"", json_data=None):
        self.status_code = status_code
        self.content = content
        self._json = json_data

    def json(self):
        if self._json is None:
            raise ValueError("pas de JSON")
        return self._json


def _patch_httpx(monkeypatch, response=None, exc=None):
    class _Client:
        def __init__(self, *_a, **_kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def get(self, *_a, **_kw):
            if exc:
                raise exc
            return response

    monkeypatch.setattr(loan_service.httpx, "AsyncClient", _Client)


BNF_XML = b"""<?xml version="1.0"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <srw:records><srw:record><srw:recordData><oai_dc:dc xmlns:oai_dc="x">
    <dc:title>Le Petit Prince</dc:title><dc:creator>Saint-Exupery</dc:creator><dc:publisher>Gallimard</dc:publisher>
  </oai_dc:dc></srw:recordData></srw:record></srw:records>
</srw:searchRetrieveResponse>"""


@pytest.mark.anyio
async def test_fetch_bnf_parses_dublin_core(monkeypatch):
    _patch_httpx(monkeypatch, _FakeResponse(content=BNF_XML))
    data, source = await loan_service._fetch_bnf_book("9782070612758")
    assert source == "BnF"
    assert data == {"title": "Le Petit Prince", "author": "Saint-Exupery", "publisher": "Gallimard", "cover_url": None}


@pytest.mark.anyio
@pytest.mark.parametrize(
    "fetch_name",
    ["_fetch_bnf_book", "_fetch_openlibrary_book", "_fetch_google_book", "_fetch_wikidata_videogame"],
)
async def test_fetchers_never_raise(monkeypatch, fetch_name):
    """Réponse non-JSON / XML invalide / timeout : (None, None), jamais d'exception."""
    fetch = getattr(loan_service, fetch_name)
    _patch_httpx(monkeypatch, _FakeResponse(content=b"<not xml", json_data=None))
    assert await fetch("123") == (None, None)
    _patch_httpx(monkeypatch, exc=loan_service.httpx.ConnectTimeout("t"))
    assert await fetch("123") == (None, None)
    _patch_httpx(monkeypatch, _FakeResponse(status_code=503))
    assert await fetch("123") == (None, None)


@pytest.mark.anyio
async def test_fetch_openlibrary_malformed_authors_does_not_raise(monkeypatch):
    """authors sans clé 'name' gérés ; authors contenant une chaîne -> ne doit pas lever."""
    _patch_httpx(monkeypatch, _FakeResponse(json_data={"ISBN:1": {"title": "T", "authors": [{"url": "x"}]}}))
    data, _ = await loan_service._fetch_openlibrary_book("1")
    assert data["author"] is None


@pytest.mark.anyio
async def test_fetch_google_ok(monkeypatch):
    payload = {"items": [{"volumeInfo": {"title": "T", "authors": ["A", "B"], "imageLinks": {"thumbnail": "u"}}}]}
    _patch_httpx(monkeypatch, _FakeResponse(json_data=payload))
    data, source = await loan_service._fetch_google_book("1")
    assert source == "Google Books" and data["author"] == "A, B" and data["cover_url"] == "u"


@pytest.mark.anyio
async def test_fetch_wikidata_ok(monkeypatch):
    payload = {"results": {"bindings": [{"itemLabel": {"value": "Zelda"}, "platformLabel": {"value": "Switch"}}]}}
    _patch_httpx(monkeypatch, _FakeResponse(json_data=payload))
    data, source = await loan_service._fetch_wikidata_videogame("1")
    assert source == "Wikidata" and data["title"] == "Zelda" and data["author"] == "Switch"
