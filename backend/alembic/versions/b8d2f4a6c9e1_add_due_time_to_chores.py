"""add due_time to chores

Revision ID: b8d2f4a6c9e1
Revises: a7c3e9f1d4b6
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d2f4a6c9e1'
down_revision: Union[str, Sequence[str], None] = 'a7c3e9f1d4b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('chores', sa.Column('due_time', sa.String(length=5), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('chores', 'due_time')
