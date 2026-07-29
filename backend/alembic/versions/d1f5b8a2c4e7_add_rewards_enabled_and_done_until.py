"""add rewards_enabled, chore done_until and previous_done_until

Revision ID: d1f5b8a2c4e7
Revises: c9e3a5b7d1f4
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1f5b8a2c4e7'
down_revision: Union[str, Sequence[str], None] = 'c9e3a5b7d1f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'households',
        sa.Column('rewards_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column('chores', sa.Column('done_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('chore_logs', sa.Column('previous_done_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('chore_logs', 'previous_done_until')
    op.drop_column('chores', 'done_until')
    op.drop_column('households', 'rewards_enabled')
