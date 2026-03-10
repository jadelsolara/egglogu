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
    # Recreate plantier enum with new tier names: hobby, starter, pro, enterprise
    # (was: free, pro, business, enterprise)
    # Must convert to text first to avoid "new enum value must be committed" error
    op.execute("ALTER TABLE subscriptions ALTER COLUMN plan TYPE text")
    op.execute("UPDATE subscriptions SET plan = 'starter' WHERE plan = 'business'")
    op.execute("UPDATE subscriptions SET plan = 'hobby' WHERE plan = 'free'")
    op.execute("DROP TYPE plantier")
    op.execute("CREATE TYPE plantier AS ENUM ('hobby', 'starter', 'pro', 'enterprise')")
    op.execute("ALTER TABLE subscriptions ALTER COLUMN plan TYPE plantier USING plan::plantier")


def downgrade() -> None:
    # Revert to original enum: free, pro, business, enterprise
    op.execute("ALTER TABLE subscriptions ALTER COLUMN plan TYPE text")
    op.execute("UPDATE subscriptions SET plan = 'business' WHERE plan = 'starter'")
    op.execute("UPDATE subscriptions SET plan = 'free' WHERE plan = 'hobby'")
    op.execute("DROP TYPE plantier")
    op.execute("CREATE TYPE plantier AS ENUM ('free', 'pro', 'business', 'enterprise')")
    op.execute("ALTER TABLE subscriptions ALTER COLUMN plan TYPE plantier USING plan::plantier")
