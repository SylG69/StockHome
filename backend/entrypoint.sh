#!/bin/sh
set -e

echo "=== Réconciliation et migrations de la base ==="
python bootstrap_db.py

echo "=== Démarrage du serveur ==="
exec uvicorn main:app --host 0.0.0.0 --port 8000