"""add oauth fields

Revision ID: c4d5e6f7a890
Revises: b3d4e5f6a789
Create Date: 2026-02-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a890'
down_revision: Union[str, None] = 'b3d4e5f6a789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('oauth_provider', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('oauth_sub', sa.String(255), nullable=True))
    op.alter_column('users', 'hashed_password', existing_type=sa.String(128), nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'hashed_password', existing_type=sa.String(128), nullable=False)
    op.drop_column('users', 'oauth_sub')
    op.drop_column('users', 'oauth_provider')
