"""add_batch_code_to_traceability

Revision ID: b3d4e5f6a789
Revises: a2c3d4e5f678
Create Date: 2026-02-10 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d4e5f6a789'
down_revision: Union[str, None] = 'a2c3d4e5f678'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add batch_code column (nullable first for existing rows)
    op.add_column(
        'traceability_batches',
        sa.Column('batch_code', sa.String(length=100), nullable=True),
    )

    # Backfill existing rows with a generated batch_code based on id
    op.execute(
        "UPDATE traceability_batches SET batch_code = 'BOX-LEGACY-' || LEFT(id::text, 8) "
        "WHERE batch_code IS NULL"
    )

    # Make non-nullable + add unique index
    op.alter_column('traceability_batches', 'batch_code', nullable=False)
    op.create_index(
        op.f('ix_traceability_batches_batch_code'),
        'traceability_batches',
        ['batch_code'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_traceability_batches_batch_code'), table_name='traceability_batches')
    op.drop_column('traceability_batches', 'batch_code')
