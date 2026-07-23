"""Configuration pytest partagée : fournit une DATABASE_URL factice pour permettre
l'import des modules backend sans base de données réelle (SQLAlchemy ne se connecte
pas au moment de l'import, seulement à l'exécution des requêtes)."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
