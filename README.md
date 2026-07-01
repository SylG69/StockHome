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
│   ├── migrate_dynamo_to_postgres.py # Migration depuis l'ancienne version AWS/DynamoDB
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
   DOMAIN="stockhome.domolinux.eu"
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

## Variables d'environnement (`backend/.env`)

| Variable        | Description                                              | Exemple |
|-----------------|------------------------------------------------------------|---------|
| `DATABASE_URL`  | Connexion PostgreSQL (psycopg2)                            | `postgresql+psycopg2://stockhome:motdepasse@localhost:5432/stockhome` |
| `JWT_SECRET`    | Secret de signature des tokens JWT                          | chaîne aléatoire longue |
| `CORS_ORIGINS`  | Origines autorisées, séparées par des virgules              | `https://stockhome.domolinux.eu` |

Variables supplémentaires, utilisées uniquement par `migrate_dynamo_to_postgres.py`
(migration depuis l'ancienne version AWS) :

| Variable         | Description                          |
|------------------|---------------------------------------|
| `AWS_REGION`     | Région AWS des anciennes tables       |
| `USERS_TABLE`    | Nom de la table DynamoDB des users    |
| `REF_TABLE`      | Nom de la table DynamoDB de référence (catégories/sous-catégories/emplacements) |
| `PRODUCTS_TABLE` | Nom de la table DynamoDB des produits |
| `SHOPPING_TABLE` | Nom de la table DynamoDB de la liste de courses |

## Migration depuis l'ancienne version AWS (DynamoDB)

Si vous migrez depuis l'ancienne architecture Lambda + DynamoDB :

```bash
cd backend
source venv/bin/activate
pip install boto3

python migrate_dynamo_to_postgres.py --dry-run   # vérifie les comptages sans écrire
python migrate_dynamo_to_postgres.py              # migration réelle
```

Les choix de correspondance de champs (hash de mot de passe hérité, sous-catégories,
`quantity`/`min_quantity`, etc.) sont documentés en commentaire en tête du script.

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
- **Erreur Apache après modification du VirtualHost** :
  `sudo apache2ctl configtest` avant `systemctl reload apache2`
- **Renouvellement du certificat Let's Encrypt** : normalement automatique via
  le timer `certbot.timer` (`systemctl list-timers | grep certbot`) ; test
  manuel avec `sudo certbot renew --dry-run`
