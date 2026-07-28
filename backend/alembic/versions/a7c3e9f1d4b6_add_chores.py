"""add chores and chore_logs tables

Revision ID: a7c3e9f1d4b6
Revises: f2b9e4a7c3d1
Create Date: 2026-07-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c3e9f1d4b6'
down_revision: Union[str, Sequence[str], None] = 'f2b9e4a7c3d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'chores',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('household_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('period_type', sa.String(length=20), nullable=False, server_default='manually'),
        sa.Column('period_hours', sa.Integer(), nullable=True),
        sa.Column('period_days', sa.Integer(), nullable=True),
        sa.Column('weekdays', sa.String(length=20), nullable=True),
        sa.Column('month_days', sa.String(length=100), nullable=True),
        sa.Column('yearly_month', sa.Integer(), nullable=True),
        sa.Column('yearly_day', sa.Integer(), nullable=True),
        sa.Column('assignment_type', sa.String(length=30), nullable=False, server_default='no-assignment'),
        sa.Column('assigned_user_id', sa.String(length=36), nullable=True),
        sa.Column('last_done_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_due_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key('fk_chores_user_id', 'chores', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key(
        'fk_chores_household_id', 'chores', 'households', ['household_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_chores_assigned_user_id', 'chores', 'users', ['assigned_user_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_chores_user_id', 'chores', ['user_id'])
    op.create_index('ix_chores_household_id', 'chores', ['household_id'])

    op.create_table(
        'chore_logs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('chore_id', sa.String(length=36), nullable=False),
        sa.Column('household_id', sa.String(length=36), nullable=False),
        sa.Column('executed_by_user_id', sa.String(length=36), nullable=True),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('previous_due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('previous_assigned_user_id', sa.String(length=36), nullable=True),
        sa.Column('new_due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_chore_logs_chore_id', 'chore_logs', 'chores', ['chore_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_chore_logs_household_id', 'chore_logs', 'households', ['household_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_chore_logs_executed_by_user_id', 'chore_logs', 'users', ['executed_by_user_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_chore_logs_chore_id', 'chore_logs', ['chore_id'])
    op.create_index('ix_chore_logs_household_id', 'chore_logs', ['household_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_chore_logs_household_id', table_name='chore_logs')
    op.drop_index('ix_chore_logs_chore_id', table_name='chore_logs')
    op.drop_table('chore_logs')

    op.drop_index('ix_chores_household_id', table_name='chores')
    op.drop_index('ix_chores_user_id', table_name='chores')
    op.drop_table('chores')
