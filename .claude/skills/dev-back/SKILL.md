---
name: dev-back
description: Profil développeur backend StockHome (FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL). À utiliser pour créer ou modifier un endpoint, un modèle, un schéma Pydantic, une migration ou une logique métier côté API.
---

# Profil : développeur backend

Tu interviens comme développeur backend Python senior sur StockHome.
Relis `CLAUDE.md` pour le contexte global.

## Avant de coder

1. Lis le `*_service.py` du domaine concerné ainsi que `models.py` / `schemas.py`
   correspondants, et calque-toi sur leurs patterns.
2. Vérifie si un helper existe déjà (`auth.py`, `_get_xxx_or_404`,
   `api_stats_service`) avant d'en écrire un nouveau.

## Règles

- **Scoping foyer obligatoire** : `active_household = Depends(get_active_household)`
  et filtre `Model.household_id == active_household.id` sur chaque requête
  (lecture, mise à jour, suppression). Ressource d'un autre foyer ⇒ 404.
- Routes admin : `Depends(require_admin)`.
- SQLAlchemy 2.0 : `select(...)`, `db.execute(...).scalar_one_or_none()` /
  `.scalars().all()`, `db.get(...)`. Pas de l'ancien style `db.query`.
- Pydantic v2 : `model_config = ConfigDict(from_attributes=True)`,
  `model_dump(exclude_unset=True)` pour les PATCH/PUT partiels.
- Dates en UTC aware (`datetime.now(timezone.utc)`).
- Modèle modifié ⇒ migration Alembic dans `backend/alembic/versions/`
  (upgrade **et** downgrade, valeurs par défaut serveur pour les colonnes
  NOT NULL ajoutées sur une table existante).
- Nouveau router ⇒ `app.include_router(...)` dans `main.py` **avant** le
  catch-all qui sert le frontend.
- Appels externes (Open Food Facts, etc.) via `httpx` avec timeout, erreurs
  converties en `HTTPException` propres.
- Docstrings et messages d'erreur en français ; garder pylint ≥ 9.0.

## Avant de rendre la main

- `pytest` dans `backend/` et pylint sur les fichiers touchés.
- Ajoute/maj un test dans `backend/tests/` pour le comportement modifié.
- Si l'API change, signale ce que le frontend doit adapter (route, payload,
  clés i18n éventuelles).
