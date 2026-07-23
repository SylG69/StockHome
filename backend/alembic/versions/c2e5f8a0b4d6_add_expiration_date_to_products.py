"""add expiration_date column to products

Revision ID: c2e5f8a0b4d6
Revises: a1d4e7c9f0b3
Create Date: 2026-07-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2e5f8a0b4d6'
down_revision: Union[str, Sequence[str], None] = 'a1d4e7c9f0b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'products',
        sa.Column('expiration_date', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('products', 'expiration_date')
