"""FarmLogU multi-vertical infrastructure

Revision ID: t1i2j3k4l567
Revises: s0h1i2j3k456
Create Date: 2026-03-08

Adds vertical column to organizations, holding_id for consolidated view,
generalizes cost center enums, and adds unit_of_measure to P&L snapshots.
"""

from alembic import op
import sqlalchemy as sa

revision = "t1i2j3k4l567"
down_revision = "s0h1i2j3k456"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Note: vertical + holding_id columns already added by p7e8f9g0h123
    from sqlalchemy import text
    conn = op.get_bind()

    # ── CostCenter enums: add new values (only if types exist) ──
    def type_exists(name: str) -> bool:
        result = conn.execute(text(
            "SELECT 1 FROM pg_type WHERE typname = :name"
        ), {"name": name})
        return result.fetchone() is not None

    if type_exists("costcentertype"):
        op.execute("ALTER TYPE costcentertype ADD VALUE IF NOT EXISTS 'herd'")
        op.execute("ALTER TYPE costcentertype ADD VALUE IF NOT EXISTS 'field'")
        op.execute("ALTER TYPE costcentertype ADD VALUE IF NOT EXISTS 'processing'")

    if type_exists("allocationmethod"):
        op.execute("ALTER TYPE allocationmethod ADD VALUE IF NOT EXISTS 'proportional_units'")
        op.execute("ALTER TYPE allocationmethod ADD VALUE IF NOT EXISTS 'proportional_revenue'")

    if type_exists("costcategory"):
        for cat in [
            "piglet_purchase", "slaughter", "calf_purchase", "milking_supplies",
            "seed", "fertilizer", "pesticide", "irrigation", "land_lease",
        ]:
            op.execute(f"ALTER TYPE costcategory ADD VALUE IF NOT EXISTS '{cat}'")

    # ── ProfitLossSnapshot: add unit_of_measure (only if not already present) ──
    result = conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'profit_loss_snapshots' AND column_name = 'unit_of_measure'"
    ))
    if result.fetchone() is None:
        op.add_column(
            "profit_loss_snapshots",
            sa.Column("unit_of_measure", sa.String(20), nullable=True),
        )


def downgrade() -> None:
    from sqlalchemy import text
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'profit_loss_snapshots' AND column_name = 'unit_of_measure'"
    ))
    if result.fetchone() is not None:
        op.drop_column("profit_loss_snapshots", "unit_of_measure")

    # Note: vertical + holding_id dropped by p7e8f9g0h123 downgrade
    # Note: Cannot remove enum values in PostgreSQL — they persist but are unused.
