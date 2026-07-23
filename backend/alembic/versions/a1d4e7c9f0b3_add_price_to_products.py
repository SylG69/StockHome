"""add price column to products

Revision ID: a1d4e7c9f0b3
Revises: f3a6b9e1c5d2
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1d4e7c9f0b3'
down_revision: Union[str, Sequence[str], None] = 'f3a6b9e1c5d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'products',
        sa.Column('price', sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('products', 'price')
