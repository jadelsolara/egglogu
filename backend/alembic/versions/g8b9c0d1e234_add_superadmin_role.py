"""add superadmin role and market intelligence table

Revision ID: g8b9c0d1e234
Revises: f7a8b9c0d123
Create Date: 2026-02-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "g8b9c0d1e234"
down_revision: Union[str, None] = "f7a8b9c0d123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add 'superadmin' to the role enum
    op.execute("ALTER TYPE role ADD VALUE IF NOT EXISTS 'superadmin' BEFORE 'owner'")

    # 2. Make users.organization_id nullable (superadmin has no org)
    op.alter_column(
        "users",
        "organization_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # 3. Create market_intelligence table (platform-wide, no tenant)
    op.create_table(
        "market_intelligence",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("report_date", sa.Date(), nullable=False, index=True),
        sa.Column("region", sa.String(100), nullable=False, index=True),
        sa.Column("egg_type", sa.String(50), nullable=False),
        sa.Column("avg_price_per_unit", sa.Float(), nullable=False),
        sa.Column("total_production_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("demand_index", sa.Float(), nullable=False, server_default="0"),
        sa.Column("supply_index", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "price_trend",
            sa.Enum("up", "down", "stable", name="pricetrend", create_type=True),
            nullable=False,
            server_default="stable",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("market_intelligence")
    op.execute("DROP TYPE IF EXISTS pricetrend")

    op.alter_column(
        "users",
        "organization_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
    # Note: removing enum values from PostgreSQL is not directly supported.
    # The 'superadmin' value will remain in the enum but be unused after downgrade.
