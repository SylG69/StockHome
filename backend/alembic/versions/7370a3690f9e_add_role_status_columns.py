"""add role and status columns to users

Revision ID: 7370a3690f9e
Revises: 432e86ace0a5
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7370a3690f9e'
down_revision: Union[str, Sequence[str], None] = '432e86ace0a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Compte toujours admin + actif, qu'il soit déjà en base ou pas encore
# inscrit (voir aussi ADMIN_EMAILS dans auth_service.py).
ADMIN_EMAIL = "s.greneron@gmail.com"


def upgrade() -> None:
    """Upgrade schema."""
    # server_default="active" pour que tous les comptes déjà existants
    # restent utilisables immédiatement après la migration (sinon ils
    # hériteraient du défaut applicatif "pending" et seraient bloqués à la
    # connexion).
    op.add_column(
        'users',
        sa.Column('role', sa.String(length=20), nullable=False, server_default='user'),
    )
    op.add_column(
        'users',
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
    )

    # On retire le server_default une fois les lignes existantes remplies :
    # les nouveaux comptes doivent utiliser le défaut applicatif ("pending"),
    # défini côté modèle SQLAlchemy, et non plus un défaut SQL fixe à "active".
    op.alter_column('users', 'status', server_default=None)
    op.alter_column('users', 'role', server_default=None)

    # Le compte s.greneron@gmail.com doit toujours être admin + actif, s'il
    # existe déjà en base au moment de la migration.
    op.execute(
        sa.text(
            "UPDATE users SET role = 'admin', status = 'active' WHERE email = :email"
        ).bindparams(email=ADMIN_EMAIL)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'status')
    op.drop_column('users', 'role')
