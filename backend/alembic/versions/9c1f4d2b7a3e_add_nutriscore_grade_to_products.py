"""add nutriscore_grade column to products

Revision ID: 9c1f4d2b7a3e
Revises: 7370a3690f9e
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c1f4d2b7a3e'
down_revision: Union[str, Sequence[str], None] = '7370a3690f9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'products',
        sa.Column('nutriscore_grade', sa.String(length=2), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('products', 'nutriscore_grade')
