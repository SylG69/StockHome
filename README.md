# StockHome

Application de gestion de stock pour la maison — suivi des produits, catégories,
emplacements de rangement et liste de courses automatique en cas de stock bas.

## Stack technique

<!-- markdownlint-disable MD060 -->
| Composant       | Technologie                                       |
|-------------    |---------------------------------------------------|
| Backend         | FastAPI (Python), SQLAlchemy 2.0, psycopg2        |
| Base de données | PostgreSQL                                        |
| Frontend        | React                                             |
| Auth            | JWT (bcrypt pour le hash des mots de passe)       |
| Déploiement     | Docker/docker-compose, ou VM (Apache reverse proxy + systemd), Let's Encrypt |
<!-- markdownlint-enable MD060 -->

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
├── dockerfile                        # Image unique (frontend buildé + backend FastAPI)
├── docker-compose.yml                # Orchestration app + PostgreSQL pour installation Docker
├── .env.example                      # Modèle de config pour docker-compose
├── install/
│   ├── deploy_stockhome.sh           # Script de déploiement complet sur VM (voir plus bas)
│   ├── create_database.sql           # Équivalent SQL pur (généré localement, non versionné)
│   └── setup_database.sh             # Création du rôle + base PostgreSQL (généré localement, non versionné)
├── deploy.sh / deploy.ps1            # Scripts de mise à jour d'une installation déjà déployée
└── README.md
```

## Trois façons d'installer StockHome

| Méthode | Quand l'utiliser |
| --- | --- |
| [Docker / docker-compose](#installation-via-docker-recommandée-pour-pc-perso--vps) | PC perso ou VPS, le plus simple et le plus rapide à mettre en place |
| [Script automatique sur VM](#installation-automatique-sur-vm-sans-docker) | VPS/VM dédiée avec Apache + Let's Encrypt + systemd, sans conteneurs |
| [Installation manuelle](#installation-manuelle-étape-par-étape) | Développement local, debug, ou environnement non couvert par les scripts |

## Installation via Docker (recommandée pour PC perso / VPS)

L'image Docker (`dockerfile` à la racine) construit le frontend React et le
sert directement depuis le backend FastAPI : un seul conteneur `app` écoute
sur le port 8000 (frontend + API `/api/...`), pas besoin d'Apache ni de
build séparé. `docker-compose.yml` ajoute un conteneur `db` PostgreSQL avec
un volume persistant.

**Prérequis :** Docker et Docker Compose installés (Docker Desktop sur PC
perso, ou `docker` + le plugin `docker-compose-plugin` sur un VPS Linux).

**Étapes :**

1. Clonez le dépôt et placez-vous à la racine :

   ```bash
   git clone https://github.com/<owner>/<repo>.git
   cd stockhome
   ```

2. Copiez le fichier de configuration et adaptez-le :

   ```bash
   cp .env.example .env
   # éditez .env : POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 32), APP_PORT
   ```

3. Construisez et démarrez les conteneurs :

   ```bash
   docker compose up -d --build
   ```

   Au démarrage, `entrypoint.sh` applique automatiquement les migrations
   Alembic (`bootstrap_db.py`) avant de lancer `uvicorn`.

4. L'application est accessible sur `http://<ip-ou-domaine>:<APP_PORT>`
   (port 8000 par défaut).

**Sur un VPS exposé publiquement**, placez un reverse proxy devant le
conteneur `app` pour gérer le domaine et le HTTPS (Apache/Nginx +
Let's Encrypt, ou [Caddy](https://caddyserver.com/) qui obtient le
certificat automatiquement), en proxifiant tout le trafic vers
`http://127.0.0.1:<APP_PORT>` (frontend et API sont sur la même origine,
aucune règle spécifique à `/api/` n'est nécessaire côté proxy). Pensez
aussi à restreindre `CORS_ORIGINS` au domaine réel plutôt que `*`.

### Reverse proxy avec Caddy (optionnel)

[Caddy](https://caddyserver.com/) est le moyen le plus simple d'exposer
l'application en HTTPS : il obtient et renouvelle automatiquement le
certificat Let's Encrypt, sans configuration manuelle de certbot.

**Installation de Caddy sur un VPS Linux (Debian/Ubuntu) :**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

(Pour les autres distributions, voir la
[documentation officielle d'installation](https://caddyserver.com/docs/install).)

**Configuration :** copiez [`Caddyfile.example`](Caddyfile.example) vers
`/etc/caddy/Caddyfile`, remplacez `votre-domaine.tld` par votre domaine
réel (le DNS doit déjà pointer vers le serveur), puis redémarrez Caddy :

```bash
sudo cp Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # adaptez le domaine
sudo systemctl reload caddy
```

L'application est alors accessible sur `https://votre-domaine.tld`, le
certificat étant émis et renouvelé automatiquement par Caddy.

**Commandes utiles :**

```bash
docker compose logs -f app        # logs de l'application
docker compose down               # arrêt (les données PostgreSQL sont conservées, volume nommé)
docker compose up -d --build      # mise à jour après un git pull
```

## Installation automatique sur VM (sans Docker)

Le script `install/deploy_stockhome.sh` fait tout en une fois : récupération
de la release GitHub, backend (venv + dépendances + service systemd), base
PostgreSQL, frontend, VirtualHost Apache et certificat Let's Encrypt.

**Prérequis sur la VM :**

- Debian/Ubuntu ou RHEL/CentOS avec accès `sudo`
- Un nom de domaine dont le DNS pointe déjà vers la VM
- Ports 80 et 443 ouverts

**Étapes :**

1. Récupérez le script (il télécharge lui-même le reste de la release) :

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/<owner>/<repo>/main/install/deploy_stockhome.sh
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
backend tourne comme service systemd (`stockhome-api`), et les migrations
Alembic sont appliquées automatiquement (`bootstrap_db.py`).

Pour mettre à jour une installation déjà déployée avec ce script, utilisez
ensuite `deploy.sh` (voir le fichier à la racine) plutôt que de relancer
`deploy_stockhome.sh`.

## Installation manuelle (étape par étape)

Si vous préférez ne pas utiliser Docker ni le script tout-en-un :

1. **Base de données** : créez un rôle et une base PostgreSQL (nom, utilisateur
   et mot de passe de votre choix), par exemple via `psql` :

   ```sql
   CREATE ROLE stockhome WITH LOGIN PASSWORD 'changeme';
   CREATE DATABASE stockhome OWNER stockhome;
   ```

2. **Backend**

   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

   cp env.example .env
   # éditez .env : DATABASE_URL, JWT_SECRET, CORS_ORIGINS

   python bootstrap_db.py        # applique les migrations Alembic
   uvicorn main:app --host 127.0.0.1 --port 8001
   ```

3. **Frontend**

   ```bash
   cd frontend
   echo "VITE_API_URL=https://stockhome.domaine.eu" > .env
   npm install
   npm run build
   # copiez le contenu de dist/ vers /var/www/stockhome
   ```

4. **Apache + Let's Encrypt** : voir la logique du script
   `install/deploy_stockhome.sh` (section Apache) pour le VirtualHost et
   l'obtention du certificat, ou adaptez votre configuration Apache existante
   en proxifiant `/api/` vers `http://127.0.0.1:8001/api/`.

5. **Service systemd** (persistance au redémarrage) : voir le bloc
   `[Unit]/[Service]/[Install]` généré par `install/deploy_stockhome.sh` pour
   un exemple prêt à copier dans `/etc/systemd/system/stockhome-api.service`.

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

### Gestion automatique par `install/deploy_stockhome.sh`

Le script génère les deux fichiers à chaque exécution :

- `backend/.env` : `DATABASE_URL`, `JWT_SECRET` et `CORS_ORIGINS` construits à
  partir des variables `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`JWT_SECRET`/`DOMAIN`
  définies en haut du script. Si un `backend/.env` existe déjà (redéploiement),
  le mot de passe DB et le JWT secret existants sont **réutilisés** plutôt que
  régénérés, pour ne pas invalider les sessions en cours ni désynchroniser le
  mot de passe du rôle PostgreSQL.
- `frontend/.env` : `VITE_API_URL=https://${DOMAIN}`, généré juste avant
  `npm run build`.

### `.env` (installation Docker)

Lu par `docker compose` à la racine du dépôt (pas par l'application
elle-même). `docker-compose.yml` traduit ses variables en `DATABASE_URL`,
`JWT_SECRET` et `CORS_ORIGINS` pour le conteneur `app`, et configure le
conteneur `db`. Un `.env.example` est fourni comme modèle à copier.

<!-- markdownlint-disable MD060 -->
| Variable | Description | Exemple |
|---|---|---|
| `POSTGRES_DB` | Nom de la base créée dans le conteneur `db` | `stockhome` |
| `POSTGRES_USER` | Rôle PostgreSQL | `stockhome` |
| `POSTGRES_PASSWORD` | Mot de passe du rôle PostgreSQL | mot de passe fort |
| `JWT_SECRET` | Secret de signature des tokens JWT | `openssl rand -hex 32` |
| `CORS_ORIGINS` | Origines autorisées, séparées par des virgules | `https://stockhome.domaine.eu` |
| `APP_PORT` | Port exposé sur l'hôte pour le conteneur `app` | `8000` |
<!-- markdownlint-enable MD060 -->

Le frontend et l'API étant servis sur la même origine par le conteneur
`app`, il n'y a pas de `VITE_API_URL` à définir pour cette méthode
d'installation (le frontend appelle l'API en chemin relatif).

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

- **(Docker) Le conteneur `app` redémarre en boucle** : `docker compose logs app`
  — souvent dû à `db` pas encore prêt (le `healthcheck` de `docker-compose.yml`
  gère normalement ce cas) ou à un `POSTGRES_PASSWORD`/`JWT_SECRET` manquant
  dans `.env`
- **(Docker) Erreur de connexion à la base au démarrage** : vérifiez que
  `POSTGRES_PASSWORD` dans `.env` n'a pas changé depuis la création du volume
  `stockhome_db_data` (PostgreSQL n'applique un nouveau mot de passe qu'à
  l'initialisation du volume, pas aux démarrages suivants)
- **(Docker) Page blanche ou 404 sur le frontend** : vérifiez que l'étape de
  build du frontend s'est bien terminée dans les logs de build
  (`docker compose build app`) — le backend affiche un message d'avertissement
  au démarrage si `static/assets` est absent
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