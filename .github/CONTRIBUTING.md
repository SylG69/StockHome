# Contribuer à StockHome

## Branches

- `main` — production, déployée automatiquement.
- `develop` — staging, déployée automatiquement.
- `feature/*` — branches de travail, déployées sur l'environnement `test` (SSH) pour l'auteur du repo.

## Workflow

1. Créer une branche `feature/<nom>` depuis `develop`.
2. Développer et tester localement (voir README pour le lancement backend/frontend).
3. Ouvrir une pull request vers `develop`.
4. La CI (pylint, eslint, tests) doit passer avant merge.

## Qualité de code

- Backend : respecter `pylint` (seuil `--fail-under=9.0`, config dans `.pylintrc`).
- Frontend : respecter `eslint` (config dans `frontend/eslint.config.js` ou équivalent).
- Toute modification du schéma de base de données doit passer par une migration Alembic (`backend/alembic`).

## Tests

- Backend : `pytest` depuis `backend/` (voir `backend/tests/`).
- Frontend : `npm test` depuis `frontend/`.
