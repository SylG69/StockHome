"""Script exécuté au démarrage du conteneur, avant uvicorn.

Réconcilie automatiquement une base existante mais jamais suivie par
Alembic (schéma déjà créé manuellement ou via l'ancien create_all())
avec l'historique de migrations, puis applique les migrations en attente.
"""

import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from database import DATABASE_URL

ALEMBIC_INI_PATH = "alembic.ini"

# Table "témoin" : si elle existe déjà mais qu'alembic_version n'existe pas,
# on considère que le schéma est déjà là et qu'il faut juste le "stamper".
SENTINEL_TABLE = "users"


def main() -> None:
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    alembic_cfg = Config(ALEMBIC_INI_PATH)

    if "alembic_version" not in existing_tables and SENTINEL_TABLE in existing_tables:
        print(
            f"[bootstrap_db] Base existante détectée sans suivi Alembic "
            f"(table '{SENTINEL_TABLE}' présente, 'alembic_version' absente). "
            f"Marquage automatique comme à jour (stamp head)."
        )
        command.stamp(alembic_cfg, "head")
    else:
        print("[bootstrap_db] Base neuve ou déjà suivie par Alembic, rien à réconcilier.")

    print("[bootstrap_db] Application des migrations en attente (upgrade head)...")
    command.upgrade(alembic_cfg, "head")
    print("[bootstrap_db] OK.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pylint: disable=broad-except
        print(f"[bootstrap_db] ERREUR : {exc}", file=sys.stderr)
        sys.exit(1)