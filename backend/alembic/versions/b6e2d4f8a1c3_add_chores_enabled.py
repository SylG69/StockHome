"""add chores_enabled to households

Revision ID: b6e2d4f8a1c3
Revises: a3f7c1e9b5d2
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6e2d4f8a1c3'
down_revision: Union[str, Sequence[str], None] = 'a3f7c1e9b5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'households',
        sa.Column('chores_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('households', 'chores_enabled')
