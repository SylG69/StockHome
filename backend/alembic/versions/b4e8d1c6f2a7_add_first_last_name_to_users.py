"""add first_name and last_name columns to users

Revision ID: b4e8d1c6f2a7
Revises: 9c1f4d2b7a3e
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4e8d1c6f2a7'
down_revision: Union[str, Sequence[str], None] = '9c1f4d2b7a3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('first_name', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
