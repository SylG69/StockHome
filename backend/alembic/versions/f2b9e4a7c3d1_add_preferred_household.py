"""add preferred_household_id and auto_switch_to_preferred to users

Revision ID: f2b9e4a7c3d1
Revises: e7a1c4f6b2d9
Create Date: 2026-07-27 00:00:02.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b9e4a7c3d1'
down_revision: Union[str, Sequence[str], None] = 'e7a1c4f6b2d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('preferred_household_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_users_preferred_household_id', 'users', 'households', ['preferred_household_id'], ['id'], ondelete='SET NULL'
    )
    op.add_column(
        'users', sa.Column('auto_switch_to_preferred', sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'auto_switch_to_preferred')
    op.drop_constraint('fk_users_preferred_household_id', 'users', type_='foreignkey')
    op.drop_column('users', 'preferred_household_id')
