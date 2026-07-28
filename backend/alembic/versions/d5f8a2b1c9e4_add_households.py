"""add households, household_members tables and household_id/active_household_id columns

Revision ID: d5f8a2b1c9e4
Revises: c2e5f8a0b4d6
Create Date: 2026-07-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5f8a2b1c9e4'
down_revision: Union[str, Sequence[str], None] = 'c2e5f8a0b4d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCOPED_TABLES = ('categories', 'sub_categories', 'storage_locations', 'products', 'shopping_list')


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'households',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('is_personal', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('invite_code', sa.String(length=16), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_households_created_by', 'households', 'users', ['created_by'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_households_invite_code', 'households', ['invite_code'], unique=True)

    op.create_table(
        'household_members',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('household_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='member'),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_household_members_household_id', 'household_members', 'households', ['household_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_household_members_user_id', 'household_members', 'users', ['user_id'], ['id'], ondelete='CASCADE'
    )
    op.create_index('ix_household_members_household_id', 'household_members', ['household_id'])
    op.create_index('ix_household_members_user_id', 'household_members', ['user_id'])
    op.create_unique_constraint(
        'uq_household_members_household_user', 'household_members', ['household_id', 'user_id']
    )

    op.add_column('users', sa.Column('active_household_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(
        'fk_users_active_household_id', 'users', 'households', ['active_household_id'], ['id'], ondelete='SET NULL'
    )

    for table in SCOPED_TABLES:
        op.add_column(table, sa.Column('household_id', sa.String(length=36), nullable=True))
        op.create_foreign_key(
            f'fk_{table}_household_id', table, 'households', ['household_id'], ['id'], ondelete='CASCADE'
        )
        op.create_index(f'ix_{table}_household_id', table, ['household_id'])


def downgrade() -> None:
    """Downgrade schema."""
    for table in SCOPED_TABLES:
        op.drop_index(f'ix_{table}_household_id', table_name=table)
        op.drop_constraint(f'fk_{table}_household_id', table, type_='foreignkey')
        op.drop_column(table, 'household_id')

    op.drop_constraint('fk_users_active_household_id', 'users', type_='foreignkey')
    op.drop_column('users', 'active_household_id')

    op.drop_constraint('uq_household_members_household_user', 'household_members', type_='unique')
    op.drop_index('ix_household_members_user_id', table_name='household_members')
    op.drop_index('ix_household_members_household_id', table_name='household_members')
    op.drop_table('household_members')

    op.drop_index('ix_households_invite_code', table_name='households')
    op.drop_table('households')
