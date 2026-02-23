"""add user geolocation fields

Revision ID: f7a8b9c0d123
Revises: e6f7a8b9c012
Create Date: 2026-02-22 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d123'
down_revision: Union[str, None] = 'e6f7a8b9c012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('geo_country', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('geo_city', sa.String(200), nullable=True))
    op.add_column('users', sa.Column('geo_region', sa.String(200), nullable=True))
    op.add_column('users', sa.Column('geo_timezone', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('geo_lat', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('geo_lng', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'geo_lng')
    op.drop_column('users', 'geo_lat')
    op.drop_column('users', 'geo_timezone')
    op.drop_column('users', 'geo_region')
    op.drop_column('users', 'geo_city')
    op.drop_column('users', 'geo_country')
