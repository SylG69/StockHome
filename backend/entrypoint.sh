#!/bin/sh
set -e

echo "=== Application des migrations Alembic ==="
alembic upgrade head

echo "=== Démarrage du serveur ==="
exec uvicorn main:app --host 0.0.0.0 --port 8000