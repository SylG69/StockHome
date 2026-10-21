"""Configuration pytest partagée : fournit une DATABASE_URL factice pour permettre
l'import des modules backend sans base de données réelle (SQLAlchemy ne se connecte
pas au moment de l'import, seulement à l'exécution des requêtes).

Fournit aussi une fixture `env` : base SQLite en mémoire (schéma créé depuis
les modèles, UNIQUEMENT pour les tests -- en production le schéma reste géré
par Alembic) + TestClient FastAPI avec `get_db` surchargé. La chaîne d'auth
réelle (JWT -> get_current_user -> get_active_household) est conservée, ce qui
permet de tester les statuts pending/disabled, require_admin et l'isolation
entre foyers de bout en bout.

Limites connues de SQLite vs PostgreSQL : longueurs String(n) non appliquées,
DateTime(timezone=True) relu sans tzinfo (compensé ci-dessous en réattachant
UTC au chargement, comme le ferait psycopg2 avec timestamptz).
"""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")


def _attach_utc(target, *_args):
    """Réattache UTC aux datetimes naïfs relus depuis SQLite (simule timestamptz)."""
    for attr in target.__mapper__.column_attrs:
        value = target.__dict__.get(attr.key)
        if isinstance(value, datetime) and value.tzinfo is None:
            target.__dict__[attr.key] = value.replace(tzinfo=timezone.utc)


class Env:
    """Contexte de test : session, client HTTP et fabriques d'objets."""

    def __init__(self, session_factory, client):
        self.session_factory = session_factory
        self.db = session_factory()
        self.client = client

    def make_user(self, username="alice", role="user", status="active", household_name=None):
        """Crée un utilisateur avec son foyer personnel (admin), actif par défaut."""
        import models  # pylint: disable=import-outside-toplevel

        user = models.User(email=f"{username}@example.com", username=username, role=role, status=status)
        self.db.add(user)
        self.db.flush()
        household = models.Household(name=household_name or f"Foyer {username}", is_personal=True)
        self.db.add(household)
        self.db.flush()
        self.db.add(models.HouseholdMember(household_id=household.id, user_id=user.id, role="admin"))
        user.active_household_id = household.id
        self.db.commit()
        return user, household

    def add_member(self, user, household, role="member", activate=True):
        """Ajoute `user` comme membre de `household` (et l'active si demandé)."""
        import models  # pylint: disable=import-outside-toplevel

        self.db.add(models.HouseholdMember(household_id=household.id, user_id=user.id, role=role))
        if activate:
            user.active_household_id = household.id
        self.db.commit()

    @staticmethod
    def headers(user):
        """En-tête Authorization Bearer valide pour `user`."""
        from auth import create_token  # pylint: disable=import-outside-toplevel

        return {"Authorization": f"Bearer {create_token(user.id)}"}


@pytest.fixture
def env():
    """Base SQLite en mémoire + TestClient, isolés par test."""
    # pylint: disable=import-outside-toplevel
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    import models  # noqa: F401  (enregistre les tables)
    from database import Base, get_db
    from main import app

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=True)

    event.listen(Base, "load", _attach_utc, propagate=True)
    event.listen(Base, "refresh", _attach_utc, propagate=True)

    def _override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app, raise_server_exceptions=False)
    context = Env(session_factory, client)
    try:
        yield context
    finally:
        context.db.close()
        app.dependency_overrides.clear()
        event.remove(Base, "load", _attach_utc)
        event.remove(Base, "refresh", _attach_utc)
        engine.dispose()
