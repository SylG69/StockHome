#!/bin/bash
###############################################################################
# Déploiement StockHome sur VM (Apache + Let's Encrypt + FastAPI + PostgreSQL)
#
# Ce script :
#   1. Récupère la dernière release (ou un tag précis) depuis GitHub
#   2. Déploie le backend (venv + dépendances + service systemd)
#   3. Déploie le frontend (build si nécessaire) dans /var/www/stockhome
#   4. Génère le .env du backend (mot de passe DB, nom de base, JWT secret)
#   5. Configure le VirtualHost Apache et obtient un certificat Let's Encrypt
#
# À ADAPTER avant de lancer : la section "CONFIGURATION" ci-dessous, en
# particulier GITHUB_REPO, REPO_BACKEND_SUBDIR / REPO_FRONTEND_SUBDIR (si
# votre repo n'utilise pas des dossiers backend/ et frontend/ à la racine),
# et CERTBOT_EMAIL.
#
# Usage :
#   sudo ./deploy_stockhome.sh
###############################################################################

set -euo pipefail

# ============================== CONFIGURATION ===============================

DOMAIN="stockhome.domolinux.eu"
CERTBOT_EMAIL="votre-email@example.com"          # À ADAPTER (requis par Let's Encrypt)

GITHUB_REPO="votre-user/stockhome"                # À ADAPTER : "owner/repo"
RELEASE_TAG="latest"                              # "latest" ou un tag précis, ex: "v1.2.0"
REPO_BACKEND_SUBDIR="backend"                     # dossier du repo contenant main.py etc.
REPO_FRONTEND_SUBDIR="frontend"                   # dossier du repo contenant le projet React

APP_DIR="/appli/stockhome"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_WEBROOT="/var/www/stockhome"
BACKEND_PORT=8001
SERVICE_NAME="stockhome-api"
SERVICE_USER="www-data"                           # utilisateur système exécutant le service

DB_NAME="stockhome"
DB_USER="stockhome"
DB_PASSWORD="${DB_PASSWORD:-}"                    # laissez vide pour génération automatique
JWT_SECRET="${JWT_SECRET:-}"                      # laissez vide pour génération automatique

CORS_ORIGINS="https://${DOMAIN}"

# ==============================================================================

if [ "$EUID" -ne 0 ]; then
    echo "Ce script doit être exécuté avec sudo (accès Apache, systemd, apt)." >&2
    exit 1
fi

for bin in curl tar python3 systemctl apache2ctl; do
    command -v "$bin" >/dev/null 2>&1 || { echo "Commande manquante : $bin" >&2; exit 1; }
done

[ -z "$DB_PASSWORD" ] && DB_PASSWORD="$(openssl rand -hex 24)"
[ -z "$JWT_SECRET" ] && JWT_SECRET="$(openssl rand -hex 32)"

echo "=== 1/7 : Paquets systèmes (Apache, Certbot, PostgreSQL client, Node si besoin) ==="
apt-get update -qq
apt-get install -y -qq apache2 certbot python3-certbot-apache python3-venv python3-pip postgresql-client rsync >/dev/null

a2enmod proxy proxy_http rewrite ssl headers >/dev/null

echo "=== 2/7 : Récupération de la release GitHub (${GITHUB_REPO} @ ${RELEASE_TAG}) ==="
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ "$RELEASE_TAG" = "latest" ]; then
    RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest")"
    TARBALL_URL="$(echo "$RELEASE_JSON" | grep -m1 '"tarball_url"' | sed -E 's/.*"tarball_url": *"([^"]+)".*/\1/')"
    RESOLVED_TAG="$(echo "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
else
    TARBALL_URL="https://github.com/${GITHUB_REPO}/archive/refs/tags/${RELEASE_TAG}.tar.gz"
    RESOLVED_TAG="$RELEASE_TAG"
fi

if [ -z "$TARBALL_URL" ]; then
    echo "Impossible de résoudre l'URL de la release. Vérifiez GITHUB_REPO / RELEASE_TAG." >&2
    exit 1
fi

echo "    Tag résolu : ${RESOLVED_TAG}"
curl -fsSL "$TARBALL_URL" -o "${WORK_DIR}/release.tar.gz"
mkdir -p "${WORK_DIR}/extracted"
tar -xzf "${WORK_DIR}/release.tar.gz" -C "${WORK_DIR}/extracted" --strip-components=1

SRC_BACKEND="${WORK_DIR}/extracted/${REPO_BACKEND_SUBDIR}"
SRC_FRONTEND="${WORK_DIR}/extracted/${REPO_FRONTEND_SUBDIR}"

[ -d "$SRC_BACKEND" ] || { echo "Dossier backend introuvable dans la release : ${SRC_BACKEND}" >&2; exit 1; }

echo "=== 3/7 : Déploiement du backend dans ${BACKEND_DIR} ==="
mkdir -p "$BACKEND_DIR"
rsync -a --delete --exclude='.env' --exclude='venv' "${SRC_BACKEND}/" "${BACKEND_DIR}/"

python3 -m venv "${BACKEND_DIR}/venv"
"${BACKEND_DIR}/venv/bin/pip" install --upgrade pip -q
"${BACKEND_DIR}/venv/bin/pip" install -r "${BACKEND_DIR}/requirements.txt" -q

echo "=== 4/7 : Génération du .env (mot de passe DB, nom de base, JWT secret) ==="
cat > "${BACKEND_DIR}/.env" <<EOF
DATABASE_URL=postgresql+psycopg2://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGINS=${CORS_ORIGINS}
EOF
chmod 600 "${BACKEND_DIR}/.env"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$BACKEND_DIR"

echo "=== 5/7 : Base de données PostgreSQL ==="
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
else
    sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null
fi
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};" >/dev/null
# Les tables (users, categories, produits, ...) sont créées automatiquement
# au démarrage de l'appli via Base.metadata.create_all().

echo "=== 6/7 : Service systemd ${SERVICE_NAME} ==="
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=StockHome API (FastAPI/uvicorn)
After=network.target postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${BACKEND_DIR}/.env
ExecStart=${BACKEND_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"

echo "=== 7/7 : Frontend + Apache + Let's Encrypt ==="

# --- Frontend : build si nécessaire, sinon copie directe (dist déjà présent) ---
mkdir -p "$FRONTEND_WEBROOT"
if [ -d "${SRC_FRONTEND}/dist" ]; then
    rsync -a --delete "${SRC_FRONTEND}/dist/" "${FRONTEND_WEBROOT}/"
elif [ -f "${SRC_FRONTEND}/package.json" ]; then
    command -v npm >/dev/null 2>&1 || { echo "npm requis pour builder le frontend, mais absent." >&2; exit 1; }
    (cd "$SRC_FRONTEND" && npm ci --silent && npm run build --silent)
    rsync -a --delete "${SRC_FRONTEND}/dist/" "${FRONTEND_WEBROOT}/"
else
    echo "Aucun dossier frontend/dist ni package.json trouvé, frontend non déployé." >&2
fi
chown -R www-data:www-data "$FRONTEND_WEBROOT"

# --- Étape 1 : vhost HTTP minimal, nécessaire pour le challenge ACME ---
APACHE_CONF="/etc/apache2/sites-available/stockhome.conf"
cat > "$APACHE_CONF" <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    DocumentRoot ${FRONTEND_WEBROOT}
</VirtualHost>
EOF
a2ensite stockhome.conf >/dev/null
apache2ctl configtest && systemctl reload apache2

# --- Étape 2 : obtention du certificat Let's Encrypt ---
if [ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    certbot certonly --apache -d "$DOMAIN" \
        --non-interactive --agree-tos -m "$CERTBOT_EMAIL"
else
    echo "    Certificat déjà présent pour ${DOMAIN}, pas de nouvelle demande."
fi

# --- Étape 3 : vhost final complet (HTTP->HTTPS + proxy API + SSL) ---
cat > "$APACHE_CONF" <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    RewriteEngine on
    RewriteCond %{SERVER_NAME} =${DOMAIN}
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
</VirtualHost>

<VirtualHost *:443>
    ServerName ${DOMAIN}

    # Frontend React (fichiers statiques)
    DocumentRoot ${FRONTEND_WEBROOT}
    <Directory ${FRONTEND_WEBROOT}>
        Options -Indexes
        AllowOverride All
        Require all granted

        # Indispensable pour React Router (SPA)
        FallbackResource /index.html
    </Directory>

    # Proxy vers FastAPI pour toutes les routes /api/
    ProxyPreserveHost On
    ProxyPass        /api/ http://127.0.0.1:${BACKEND_PORT}/api/
    ProxyPassReverse /api/ http://127.0.0.1:${BACKEND_PORT}/api/

    # Headers CORS gérés par FastAPI, pas Apache
    # Ne pas doubler ici

    ErrorLog  \${APACHE_LOG_DIR}/stockhome_error.log
    CustomLog \${APACHE_LOG_DIR}/stockhome_access.log combined

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${DOMAIN}/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
EOF

apache2ctl configtest && systemctl reload apache2

echo ""
echo "=== Déploiement terminé ==="
echo "Site      : https://${DOMAIN}"
echo "Backend   : systemctl status ${SERVICE_NAME}"
echo "Logs      : journalctl -u ${SERVICE_NAME} -f"
echo "DB        : ${DB_NAME} (utilisateur ${DB_USER})"
echo "Le mot de passe DB et le JWT secret générés sont dans : ${BACKEND_DIR}/.env"
