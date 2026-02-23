"""update plantier enum to new tier names

Revision ID: d5e6f7a8b901
Revises: c4d5e6f7a890
Create Date: 2026-02-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b901'
down_revision: Union[str, None] = 'c4d5e6f7a890'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new enum values to plantier that match the Python PlanTier enum:
    # hobby, starter, pro, enterprise
    # The original migration had: free, pro, business, enterprise
    # We need: hobby (new), starter (new) — pro and enterprise already exist
    op.execute("ALTER TYPE plantier ADD VALUE IF NOT EXISTS 'hobby'")
    op.execute("ALTER TYPE plantier ADD VALUE IF NOT EXISTS 'starter'")

    # Migrate existing rows from old tier names to new ones
    # 'business' -> 'starter' (pro stays as pro, enterprise stays as enterprise)
    op.execute("UPDATE subscriptions SET plan = 'starter' WHERE plan = 'business'")
    # 'free' -> 'hobby' (if any exist)
    op.execute("UPDATE subscriptions SET plan = 'hobby' WHERE plan = 'free'")


def downgrade() -> None:
    # Migrate back to old tier names
    op.execute("UPDATE subscriptions SET plan = 'business' WHERE plan = 'starter'")
    op.execute("UPDATE subscriptions SET plan = 'free' WHERE plan = 'hobby'")
    # Note: PostgreSQL enum values cannot be removed, only added.
    # Old values (free, business) still exist in the enum but are unused after upgrade.
