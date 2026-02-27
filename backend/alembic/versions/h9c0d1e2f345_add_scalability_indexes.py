"""add scalability indexes for analytics, sync, and pagination

Revision ID: h9c0d1e2f345
Revises: g8b9c0d1e234
Create Date: 2026-02-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "h9c0d1e2f345"
down_revision: Union[str, None] = "g8b9c0d1e234"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sync performance: updated_at lookups
    op.create_index(
        "ix_daily_production_updated_at", "daily_production", ["updated_at"]
    )

    # Analytics: flock+date composite for production queries
    op.create_index(
        "ix_daily_production_flock_date",
        "daily_production",
        ["flock_id", "date"],
    )

    # Sync: org+updated_at composite for delta queries
    op.create_index(
        "ix_flocks_org_updated", "flocks", ["organization_id", "updated_at"]
    )

    # Analytics: flock_id lookups for cost aggregation
    op.create_index("ix_feed_purchases_flock", "feed_purchases", ["flock_id"])
    op.create_index("ix_vaccines_flock", "vaccines", ["flock_id"])
    op.create_index("ix_medications_flock", "medications", ["flock_id"])

    # Sync: org+updated_at composites for financial entities
    op.create_index(
        "ix_expenses_org_updated", "expenses", ["organization_id", "updated_at"]
    )
    op.create_index(
        "ix_incomes_org_updated", "incomes", ["organization_id", "updated_at"]
    )

    # Inventory & support filtering
    op.create_index(
        "ix_stock_movements_type", "stock_movements", ["movement_type"]
    )
    op.create_index(
        "ix_support_tickets_status", "support_tickets", ["status"]
    )

    # Feed consumption: flock_id for analytics joins
    op.create_index(
        "ix_feed_consumption_flock", "feed_consumption", ["flock_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_feed_consumption_flock", table_name="feed_consumption")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_stock_movements_type", table_name="stock_movements")
    op.drop_index("ix_incomes_org_updated", table_name="incomes")
    op.drop_index("ix_expenses_org_updated", table_name="expenses")
    op.drop_index("ix_medications_flock", table_name="medications")
    op.drop_index("ix_vaccines_flock", table_name="vaccines")
    op.drop_index("ix_feed_purchases_flock", table_name="feed_purchases")
    op.drop_index("ix_flocks_org_updated", table_name="flocks")
    op.drop_index(
        "ix_daily_production_flock_date", table_name="daily_production"
    )
    op.drop_index(
        "ix_daily_production_updated_at", table_name="daily_production"
    )
