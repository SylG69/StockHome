"""add reward fields and rewards_summary_weekday

Revision ID: c9e3a5b7d1f4
Revises: b8d2f4a6c9e1
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9e3a5b7d1f4'
down_revision: Union[str, Sequence[str], None] = 'b8d2f4a6c9e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('chores', sa.Column('reward', sa.Numeric(10, 2), nullable=True))
    op.add_column('chore_logs', sa.Column('reward_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column(
        'households',
        sa.Column('rewards_summary_weekday', sa.Integer(), nullable=False, server_default='7'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('households', 'rewards_summary_weekday')
    op.drop_column('chore_logs', 'reward_amount')
    op.drop_column('chores', 'reward')
