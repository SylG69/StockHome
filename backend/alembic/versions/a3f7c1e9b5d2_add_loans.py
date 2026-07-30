"""add loans table and household loan settings

Revision ID: a3f7c1e9b5d2
Revises: f4b6d8e0a2c5
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f7c1e9b5d2'
down_revision: Union[str, Sequence[str], None] = 'f4b6d8e0a2c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'households',
        sa.Column('loan_book_duration_days', sa.Integer(), nullable=False, server_default='21'),
    )
    op.add_column(
        'households',
        sa.Column('loan_game_duration_days', sa.Integer(), nullable=False, server_default='14'),
    )
    op.add_column(
        'households',
        sa.Column('loans_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        'loans',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('household_id', sa.String(length=36), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('author', sa.String(length=255), nullable=True),
        sa.Column('publisher', sa.String(length=255), nullable=True),
        sa.Column('cover_url', sa.Text(), nullable=True),
        sa.Column('barcode', sa.String(length=20), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=False, server_default=''),
        sa.Column('borrowed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('returned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key('fk_loans_user_id', 'loans', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key(
        'fk_loans_household_id', 'loans', 'households', ['household_id'], ['id'], ondelete='CASCADE'
    )
    op.create_index('ix_loans_user_id', 'loans', ['user_id'])
    op.create_index('ix_loans_household_id', 'loans', ['household_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_loans_household_id', table_name='loans')
    op.drop_index('ix_loans_user_id', table_name='loans')
    op.drop_table('loans')

    op.drop_column('households', 'loans_enabled')
    op.drop_column('households', 'loan_game_duration_days')
    op.drop_column('households', 'loan_book_duration_days')
