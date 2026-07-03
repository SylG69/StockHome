# StockHome

Application de gestion de stock pour la maison — suivi des produits, catégories,
emplacements de rangement et liste de courses automatique en cas de stock bas.

## Stack technique

| Composant   | Technologie                                      |
|-------------|---------------------------------------------------|
| Backend     | FastAPI (Python), SQLAlchemy 2.0, psycopg2        |
| Base de données | PostgreSQL                                    |
| Frontend    | React                                              |
| Auth        | JWT (bcrypt pour le hash des mots de passe)       |
| Déploiement | VM (Apache reverse proxy + systemd), Let's Encrypt |

## Structure du dépôt

```
.
├── backend/
│   ├── main.py                       # Point d'entrée FastAPI, monte les routers
│   ├── auth_service.py               # /api/auth/* (inscription, connexion, profil)
│   ├── config_service.py             # /api/categories, /api/subcategories, /api/locations
│   ├── product_service.py            # /api/products/*, /api/barcode/*
│   ├── shopping_service.py           # /api/shopping-list/*
│   ├── dashboard_service.py          # /api/dashboard/stats
│   ├── models.py                     # Modèles SQLAlchemy (tables PostgreSQL)
│   ├── schemas.py                    # Schémas Pydantic (requêtes/réponses)
│   ├── auth.py                       # JWT + hash des mots de passe
│   ├── database.py                   # Connexion PostgreSQL (psycopg2, synchrone)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                         # Application React
├── setup_database.sh                 # Création du rôle + base PostgreSQL (standalone)
├── create_database.sql               # Équivalent SQL pur de setup_database.sh
├── deploy_stockhome.sh               # Script de déploiement complet (voir plus bas)
└── README.md
```

## Installation automatique (recommandée)

Le script `deploy_stockhome.sh` fait tout en une fois : récupération de la release
GitHub, backend (venv + dépendances + service systemd), base PostgreSQL, frontend,
VirtualHost Apache et certificat Let's Encrypt.

**Prérequis sur la VM :**
- Debian/Ubuntu avec accès `sudo`
- Un nom de domaine dont le DNS pointe déjà vers la VM
- Ports 80 et 443 ouverts

**Étapes :**

1. Récupérez le script (il télécharge lui-même le reste de la release) :
   ```bash
   curl -fsSLO https://raw.githubusercontent.com/<owner>/<repo>/main/deploy_stockhome.sh
   chmod +x deploy_stockhome.sh
   ```

2. Ouvrez le script et adaptez la section `CONFIGURATION` en haut du fichier :
   ```bash
   DOMAIN="stockhome.domaine.eu"
   CERTBOT_EMAIL="votre-email@example.com"
   GITHUB_REPO="votre-user/stockhome"
   RELEASE_TAG="latest"        # ou un tag précis, ex: "v1.2.0"
   ```

3. Lancez-le :
   ```bash
   sudo ./deploy_stockhome.sh
   ```

Le mot de passe de la base de données et le secret JWT sont **générés
automatiquement** (`openssl rand`) et écrits dans `backend/.env` sur la VM —
aucune valeur à saisir à la main.

À la fin de l'exécution, le site est accessible en HTTPS sur `DOMAIN`, le
backend tourne comme service systemd (`stockhome-api`), et les tables
PostgreSQL sont créées automatiquement au premier démarrage de l'application.

## Installation manuelle (étape par étape)

Si vous préférez ne pas utiliser le script tout-en-un :

1. **Base de données**
   ```bash
   chmod +x setup_database.sh
   ./setup_database.sh
   ```
   (ou exécutez `create_database.sql` vous-même via `psql`)

2. **Backend**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

   cp .env.example .env
   # éditez .env : DATABASE_URL, JWT_SECRET, CORS_ORIGINS

   uvicorn main:app --host 127.0.0.1 --port 8001
   ```
   Les tables sont créées automatiquement au démarrage (`Base.metadata.create_all()`).

3. **Frontend**
   ```bash
   cd frontend
   echo "VITE_API_URL=https://stockhome.domaine.eu" > .env
   npm install
   npm run build
   # copiez le contenu de dist/ vers /var/www/stockhome
   ```

4. **Apache + Let's Encrypt** : voir la logique du script `deploy_stockhome.sh`
   (section Apache) pour le VirtualHost et l'obtention du certificat, ou
   adaptez votre configuration Apache existante en proxifiant `/api/` vers
   `http://127.0.0.1:8001/api/`.

5. **Service systemd** (persistance au redémarrage) : voir le bloc
   `[Unit]/[Service]/[Install]` généré par `deploy_stockhome.sh` pour un
   exemple prêt à copier dans `/etc/systemd/system/stockhome-api.service`.

## Variables d'environnement

Le projet utilise deux fichiers `.env` distincts, un par côté (backend et
frontend), car ils ne sont pas lus au même moment ni par le même outil.

### `backend/.env`

Lu au démarrage de l'application via `load_dotenv()` (`database.py`). Un
`.env.example` est fourni comme modèle à copier.

| Variable        | Description                                              | Exemple |
|-----------------|------------------------------------------------------------|---------|
| `DATABASE_URL`  | Connexion PostgreSQL (psycopg2)                            | `postgresql+psycopg2://stockhome:motdepasse@localhost:5432/stockhome` |
| `JWT_SECRET`    | Secret de signature des tokens JWT                          | chaîne aléatoire longue |
| `CORS_ORIGINS`  | Origines autorisées, séparées par des virgules              | `https://stockhome.domaine.eu` |

Modifier ce fichier nécessite un redémarrage du service pour être pris en
compte : `sudo systemctl restart stockhome-api`.

### `frontend/.env`

Lu par Vite **au moment du `npm run build`** (pas au runtime dans le
navigateur) : seules les variables préfixées `VITE_` sont exposées au code
via `import.meta.env`. Une fois le build fait, la valeur est figée dans les
fichiers JS générés — un changement de domaine nécessite un nouveau build.

| Variable         | Description                          | Exemple |
|------------------|----------------------------------------|---------|
| `VITE_API_URL`   | URL de base de l'API, sans `/api` final (ajouté par `AuthContext.jsx`) | `https://stockhome.domaine.eu` |

### Gestion automatique par `deploy_stockhome.sh`

Le script génère les deux fichiers à chaque exécution :

- `backend/.env` : `DATABASE_URL`, `JWT_SECRET` et `CORS_ORIGINS` construits à
  partir des variables `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`JWT_SECRET`/`DOMAIN`
  définies en haut du script. Si un `backend/.env` existe déjà (redéploiement),
  le mot de passe DB et le JWT secret existants sont **réutilisés** plutôt que
  régénérés, pour ne pas invalider les sessions en cours ni désynchroniser le
  mot de passe du rôle PostgreSQL.
- `frontend/.env` : `VITE_API_URL=https://${DOMAIN}`, généré juste avant
  `npm run build`.

## API

Toutes les routes sont préfixées par `/api`. Documentation interactive générée
automatiquement par FastAPI, disponible en développement sur `/docs` (Swagger)
et `/redoc`.

| Router                  | Préfixe               | Contenu |
|--------------------------|------------------------|---------|
| `auth_service.py`        | `/api/auth`           | Inscription, connexion, profil |
| `config_service.py`      | `/api`                 | Catégories, sous-catégories, emplacements |
| `product_service.py`     | `/api`                 | Produits, recherche code-barres (Open Food Facts) |
| `shopping_service.py`    | `/api/shopping-list`  | Liste de courses (manuelle + génération automatique) |
| `dashboard_service.py`   | `/api/dashboard`      | Statistiques agrégées |

## Dépannage

- **Le service ne démarre pas** : `journalctl -u stockhome-api -f`
- **`.env` non pris en compte** : vérifiez qu'il est bien dans `backend/.env`
  (le fichier est chargé via `load_dotenv()` dans `database.py`, au démarrage
  de l'app uniquement — un fichier `.env` modifié à chaud nécessite un
  redémarrage du service : `sudo systemctl restart stockhome-api`)
- **Le frontend appelle toujours l'ancienne URL d'API après changement de
  domaine** : `VITE_API_URL` est figée dans les fichiers JS au moment du
  build, pas lue au runtime — il faut régénérer `frontend/.env` puis relancer
  `npm run build` (ou simplement rejouer `deploy_stockhome.sh`)
- **Erreur Apache après modification du VirtualHost** :
  `sudo apache2ctl configtest` avant `systemctl reload apache2`
- **Renouvellement du certificat Let's Encrypt** : normalement automatique via
  le timer `certbot.timer` (`systemctl list-timers | grep certbot`) ; test
  manuel avec `sudo certbot renew --dry-run`