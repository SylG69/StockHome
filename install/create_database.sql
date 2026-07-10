-- Alternative SQL pure au script setup_database.sh, si vous préférez lancer
-- vous-même les commandes (via `sudo -u postgres psql` ou un client graphique).
-- Remplacez 'changeme' par un vrai mot de passe avant exécution.

CREATE ROLE stockhome WITH LOGIN PASSWORD 'changeme';

CREATE DATABASE stockhome OWNER stockhome;

GRANT ALL PRIVILEGES ON DATABASE stockhome TO stockhome;

-- À exécuter ensuite en étant CONNECTÉ à la base "stockhome" (\c stockhome)
-- Nécessaire en PostgreSQL 15+ où le schéma public n'accorde plus CREATE
-- à tout le monde par défaut.
GRANT ALL ON SCHEMA public TO stockhome;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO stockhome;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO stockhome;

-- Les tables (users, categories, sub_categories, storage_locations,
-- products, shopping_list) sont créées automatiquement par l'application au
-- démarrage (Base.metadata.create_all() dans main.py), pas besoin de les
-- créer ici à la main.
