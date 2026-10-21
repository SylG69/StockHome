# StockHome — contexte projet

Application web de gestion de stock à domicile : produits, catégories /
sous-catégories, emplacements, liste de courses auto (stock bas), scanner
code-barres (Open Food Facts), foyers partagés, tâches ménagères /
récompenses, emprunts médiathèque (livres, jeux vidéo), stats API.

> `memory/PRD.md` est historique (il mentionne MongoDB) : la base est
> **PostgreSQL**. `memory/todo.md` liste les bugs/tâches en cours.

## Stack

- **Backend** : FastAPI, SQLAlchemy 2.0 (style `Mapped[...]`, sessions
  synchrones psycopg2), Pydantic v2, Alembic, JWT (python-jose) + bcrypt.
- **Frontend** : React 19 + Vite, Tailwind, shadcn/ui (`src/components/ui`),
  react-router 7, axios, react-hook-form + zod, i18next (fr/en/es), recharts,
  @zxing/library (scanner), PWA.
- **Déploiement** : image Docker unique (front buildé servi par FastAPI) +
  PostgreSQL via `docker-compose.yml` ; ou VM (Apache/Caddy + systemd).
- **CI** (`.github/workflows/ci-cd.yml`) : pylint (`--fail-under=9.0`),
  eslint (SARIF), pytest, vitest, CodeQL.

## Arborescence utile

```text
backend/
  main.py              # monte les routers ; le catch-all SPA doit rester EN DERNIER
  *_service.py         # un router par domaine (auth, config, product, shopping,
                       # dashboard, household, chore, loan, api_stats)
  models.py            # modèles SQLAlchemy
  schemas.py           # schémas Pydantic requêtes/réponses
  auth.py              # JWT, get_current_user, require_admin, get_active_household
  database.py          # engine + get_db
  alembic/versions/    # migrations (le schéma est géré UNIQUEMENT par Alembic)
  tests/               # pytest (conftest fournit une DATABASE_URL factice)
frontend/src/
  pages/               # une page / section de config par fichier
  components/ui/       # composants shadcn (ne pas réécrire, composer)
  context/AuthContext.jsx  # instance axios (baseURL `${VITE_API_URL}/api`) + token
  locales/{fr,en,es}/  # un JSON par namespace i18n, mêmes clés dans les 3 langues
  i18n/index.js        # enregistrement des namespaces
design_guidelines.json # charte UI (polices, palette sombre, composants)
```

## Conventions

- **Langue** : code en anglais, docstrings / commentaires / messages d'erreur
  API en français. Commits au format `feat: …`, `fix: …` (en français).
- **Multi-foyer** : toute donnée métier est scopée par `household_id`.
  Chaque endpoint métier dépend de `get_active_household` et filtre
  **toujours** sur `household_id == active_household.id`. Un objet d'un autre
  foyer renvoie 404 (pas 403).
- **Auth** : `get_current_user` (refuse comptes `pending`/`disabled`),
  `require_admin` pour les routes d'administration.
- **Schéma BDD** : toute modif de `models.py` ⇒ nouvelle migration Alembic
  (`alembic revision -m "…"` dans `backend/`), jamais de `create_all`.
- **Services** : helpers privés `_xxx`, constantes de message
  (`XXX_NOT_FOUND`), `_get_xxx_or_404(db, id, household_id)`.
- **Frontend** : textes via `useTranslation('<namespace>')` — jamais de chaîne
  en dur ; ajouter la clé dans fr, en **et** es. Alias `@/` → `src/`.
  Classes via `cn()` (`src/lib/utils.js`). Doit rester utilisable sur mobile
  (PWA, pas de débordement horizontal).
- Branches : `feature/*` → PR vers `develop` → `main`.

## Commandes

```bash
# Backend (depuis backend/)
pip install -r requirements-dev.txt
uvicorn main:app --reload          # nécessite DATABASE_URL (.env)
alembic upgrade head
pytest
pylint --rcfile=../.pylintrc $(git ls-files '*.py')

# Frontend (depuis frontend/)
npm install --legacy-peer-deps
npm start        # vite dev
npm test         # vitest run
npx eslint .
npm run build

# Stack complète
docker compose up --build
```

## Profils (skills)

Des profils spécialisés sont disponibles dans `.claude/skills/` :
`/dev-back`, `/dev-front`, `/testeur`, `/cyber-secu`, `/devops`, et
`/chef <demande>` qui orchestre les sous-agents ci-dessous (ex. `/chef revue
complète` lance les trois en parallèle et fusionne leurs rapports).

Sous-agents (contexte isolé, rapport final uniquement) dans `.claude/agents/` :

- `auditeur-secu` — audit sécurité en **lecture seule** (grille :
  skill `cyber-secu`) ;
- `testeur-qa` — campagne de tests autonome, n'écrit que des fichiers de
  test (démarche : skill `testeur`) ;
- `auditeur-devops` — relecture des pipelines GitHub Actions (et infra
  Docker / déploiement) en **lecture seule** (grille : skill `devops`).
