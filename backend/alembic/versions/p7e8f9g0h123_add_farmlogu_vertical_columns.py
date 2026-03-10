"""add farmlogu vertical columns to organizations

Revision ID: p7e8f9g0h123
Revises: o6d7e8f9g012
Create Date: 2026-03-09

"""

from alembic import op
import sqlalchemy as sa

revision = "p7e8f9g0h123"
down_revision = "o6d7e8f9g012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("vertical", sa.String(20), nullable=False, server_default="eggs"),
    )
    op.create_index("ix_organizations_vertical", "organizations", ["vertical"])
    op.add_column(
        "organizations",
        sa.Column("holding_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_organizations_holding_id",
        "organizations",
        "organizations",
        ["holding_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_organizations_holding_id", "organizations", type_="foreignkey")
    op.drop_column("organizations", "holding_id")
    op.drop_index("ix_organizations_vertical", table_name="organizations")
    op.drop_column("organizations", "vertical")
