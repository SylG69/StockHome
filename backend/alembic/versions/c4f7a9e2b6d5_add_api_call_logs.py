"""add api_call_logs table

Revision ID: c4f7a9e2b6d5
Revises: b6e2d4f8a1c3
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f7a9e2b6d5'
down_revision: Union[str, Sequence[str], None] = 'b6e2d4f8a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'api_call_logs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('success', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_api_call_logs_user_id', 'api_call_logs', 'users', ['user_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_api_call_logs_user_id', 'api_call_logs', ['user_id'])
    op.create_index('ix_api_call_logs_source', 'api_call_logs', ['source'])
    op.create_index('ix_api_call_logs_created_at', 'api_call_logs', ['created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_api_call_logs_created_at', table_name='api_call_logs')
    op.drop_index('ix_api_call_logs_source', table_name='api_call_logs')
    op.drop_index('ix_api_call_logs_user_id', table_name='api_call_logs')
    op.drop_table('api_call_logs')
