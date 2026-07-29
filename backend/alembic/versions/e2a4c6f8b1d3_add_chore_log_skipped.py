"""add skipped flag to chore_logs

Revision ID: e2a4c6f8b1d3
Revises: d1f5b8a2c4e7
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2a4c6f8b1d3'
down_revision: Union[str, Sequence[str], None] = 'd1f5b8a2c4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'chore_logs',
        sa.Column('skipped', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('chore_logs', 'skipped')
