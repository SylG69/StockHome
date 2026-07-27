"""backfill personal households for existing users and tighten household_id columns

Revision ID: e7a1c4f6b2d9
Revises: d5f8a2b1c9e4
Create Date: 2026-07-27 00:00:01.000000

"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a1c4f6b2d9'
down_revision: Union[str, Sequence[str], None] = 'd5f8a2b1c9e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCOPED_TABLES = ('categories', 'sub_categories', 'storage_locations', 'products', 'shopping_list')


def upgrade() -> None:
    """Data migration: crée un foyer personnel par utilisateur existant et
    backfille household_id sur ses données, puis rend les colonnes obligatoires."""
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    users = sa.table(
        'users',
        sa.column('id', sa.String),
        sa.column('username', sa.String),
        sa.column('active_household_id', sa.String),
    )
    households = sa.table(
        'households',
        sa.column('id', sa.String),
        sa.column('name', sa.String),
        sa.column('is_personal', sa.Boolean),
        sa.column('invite_code', sa.String),
        sa.column('created_by', sa.String),
        sa.column('created_at', sa.DateTime),
    )
    members = sa.table(
        'household_members',
        sa.column('id', sa.String),
        sa.column('household_id', sa.String),
        sa.column('user_id', sa.String),
        sa.column('role', sa.String),
        sa.column('joined_at', sa.DateTime),
    )

    existing_users = bind.execute(sa.select(users.c.id, users.c.username)).fetchall()

    for user_id, username in existing_users:
        household_id = str(uuid.uuid4())
        bind.execute(
            households.insert().values(
                id=household_id,
                name=f"Foyer de {username}",
                is_personal=True,
                invite_code=None,
                created_by=user_id,
                created_at=now,
            )
        )
        bind.execute(
            members.insert().values(
                id=str(uuid.uuid4()), household_id=household_id, user_id=user_id, role='admin', joined_at=now,
            )
        )
        bind.execute(
            users.update().where(users.c.id == user_id).values(active_household_id=household_id)
        )
        for table_name in SCOPED_TABLES:
            table = sa.table(table_name, sa.column('user_id', sa.String), sa.column('household_id', sa.String))
            bind.execute(
                table.update().where(table.c.user_id == user_id).values(household_id=household_id)
            )

    op.alter_column('users', 'active_household_id', nullable=False)
    for table_name in SCOPED_TABLES:
        op.alter_column(table_name, 'household_id', nullable=False)


def downgrade() -> None:
    """Repasse les colonnes en nullable. Les foyers personnels créés par le
    backfill ne sont pas supprimés (opération destructive non réversible ici,
    cohérent avec le fait qu'aucune migration de ce dépôt ne restaure les
    données lors d'un downgrade)."""
    for table_name in SCOPED_TABLES:
        op.alter_column(table_name, 'household_id', nullable=True)
    op.alter_column('users', 'active_household_id', nullable=True)
