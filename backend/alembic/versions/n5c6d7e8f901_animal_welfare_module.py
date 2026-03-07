"""animal welfare module

Revision ID: n5c6d7e8f901
Revises: m4b5c6d7e890
Create Date: 2026-03-05

"""

from alembic import op
import sqlalchemy as sa

revision = "n5c6d7e8f901"
down_revision = "m4b5c6d7e890"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "welfare_assessments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("flock_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("plumage_score", sa.Integer(), nullable=False),
        sa.Column("mobility_score", sa.Integer(), nullable=False),
        sa.Column("behavior_score", sa.Integer(), nullable=False),
        sa.Column("space_per_bird_sqm", sa.Float(), nullable=True),
        sa.Column("nest_access", sa.Boolean(), nullable=True),
        sa.Column("perch_access", sa.Boolean(), nullable=True),
        sa.Column("lighting_hours", sa.Float(), nullable=True),
        sa.Column("litter_condition_score", sa.Integer(), nullable=True),
        sa.Column("foot_pad_score", sa.Integer(), nullable=True),
        sa.Column("feather_pecking_observed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mortality_today", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("overall_score", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("share_anonymized", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["flock_id"], ["flocks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_welfare_assessments_flock_id", "welfare_assessments", ["flock_id"])
    op.create_index("ix_welfare_assessments_org_date", "welfare_assessments", ["organization_id", "date"])
    op.create_index("ix_welfare_assessments_share", "welfare_assessments", ["share_anonymized"], postgresql_where=sa.text("share_anonymized = true"))


def downgrade() -> None:
    op.drop_index("ix_welfare_assessments_share", table_name="welfare_assessments")
    op.drop_index("ix_welfare_assessments_org_date", table_name="welfare_assessments")
    op.drop_index("ix_welfare_assessments_flock_id", table_name="welfare_assessments")
    op.drop_table("welfare_assessments")
