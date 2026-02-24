"""add economics fields

Revision ID: a1b2c3d4e567
Revises: f7a8b9c0d123
Create Date: 2026-02-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e567"
down_revision: Union[str, None] = "f7a8b9c0d123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "flocks", sa.Column("purchase_cost_per_bird", sa.Float(), nullable=True)
    )
    op.add_column("vaccines", sa.Column("cost", sa.Float(), nullable=True))
    op.add_column("medications", sa.Column("cost", sa.Float(), nullable=True))
    op.add_column(
        "expenses",
        sa.Column(
            "flock_id",
            sa.Uuid(),
            sa.ForeignKey("flocks.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(op.f("ix_expenses_flock_id"), "expenses", ["flock_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_expenses_flock_id"), table_name="expenses")
    op.drop_column("expenses", "flock_id")
    op.drop_column("medications", "cost")
    op.drop_column("vaccines", "cost")
    op.drop_column("flocks", "purchase_cost_per_bird")
