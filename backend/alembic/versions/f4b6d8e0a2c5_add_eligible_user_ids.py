"""add eligible_user_ids to chores

Revision ID: f4b6d8e0a2c5
Revises: e2a4c6f8b1d3
Create Date: 2026-08-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4b6d8e0a2c5'
down_revision: Union[str, Sequence[str], None] = 'e2a4c6f8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('chores', sa.Column('eligible_user_ids', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('chores', 'eligible_user_ids')
