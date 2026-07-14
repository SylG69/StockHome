#!/bin/bash
# Création du rôle et de la base PostgreSQL pour StockHome.
# À exécuter sur la VM, en tant qu'utilisateur ayant les droits sudo sur postgres.
#
# Usage :
#   chmod +x setup_database.sh
#   ./setup_database.sh
#
# Le script demande un mot de passe si DB_PASSWORD n'est pas déjà défini en
# variable d'environnement, pour éviter de le laisser en clair dans l'historique bash.

set -e

DB_NAME="${DB_NAME:-stockhome}"
DB_USER="${DB_USER:-stockhome}"

if [ -z "$DB_PASSWORD" ]; then
    read -rsp "Mot de passe pour le rôle PostgreSQL '$DB_USER' : " DB_PASSWORD
    echo
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<-EOSQL
    -- Création du rôle applicatif (ne fait rien s'il existe déjà)
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
            CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
        ELSE
            ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
        END IF;
    END
    \$\$;

    -- Création de la base, avec le rôle applicatif comme propriétaire
    SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

    GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOSQL

# Droits sur le schéma public : nécessaires en PostgreSQL 15+, où le schéma
# public n'accorde plus CREATE à tout le monde par défaut. Comme le rôle est
# déjà propriétaire de la base, ces GRANT sont surtout une sécurité si vous
# migrez une base déjà existante ou changez de propriétaire plus tard.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<-EOSQL
    GRANT ALL ON SCHEMA public TO ${DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
EOSQL

echo ""
echo "OK : rôle '${DB_USER}' et base '${DB_NAME}' prêts."
echo "Mettez à jour votre .env :"
echo "DATABASE_URL=postgresql+psycopg2://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
echo "Les TABLES elles-mêmes seront créées automatiquement au premier"
echo "démarrage de l'application (uvicorn main:app), via Base.metadata.create_all()."
