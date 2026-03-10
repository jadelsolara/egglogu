"""outbreak alerts - geo-targeted outbreak alarm system

Revision ID: p7f0a1b2c345
Revises: p7e8f9g0h123
Create Date: 2026-03-08

"""

from alembic import op
import sqlalchemy as sa

revision = "p7f0a1b2c345"
down_revision = "p7e8f9g0h123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create enums explicitly (asyncpg safe) ──
    op.execute("DO $$ BEGIN CREATE TYPE outbreakseverity AS ENUM ('low','moderate','high','critical'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE transmissiontype AS ENUM ('airborne','contact','vector','waterborne','fomite','unknown'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    op.create_table(
        "outbreak_alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("disease", sa.String(200), nullable=False),
        sa.Column(
            "severity",
            sa.Enum("low", "moderate", "high", "critical", name="outbreakseverity", create_type=False),
            nullable=False,
            server_default="moderate",
        ),
        sa.Column(
            "transmission",
            sa.Enum(
                "airborne", "contact", "vector", "waterborne", "fomite", "unknown",
                name="transmissiontype", create_type=False,
            ),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column("species_affected", sa.String(300), nullable=False, server_default="poultry"),
        sa.Column("epicenter_lat", sa.Float(), nullable=False),
        sa.Column("epicenter_lng", sa.Float(), nullable=False),
        sa.Column("radius_km", sa.Float(), nullable=False, server_default="100"),
        sa.Column("region_name", sa.String(200), nullable=False),
        sa.Column("detected_date", sa.Date(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("contingency_protocol", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("confirmed_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deaths_reported", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("spread_speed_km_day", sa.Float(), nullable=True),
        sa.Column("spread_direction", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_outbreak_alerts_disease", "outbreak_alerts", ["disease"])
    op.create_index("ix_outbreak_alerts_is_active", "outbreak_alerts", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_outbreak_alerts_is_active", table_name="outbreak_alerts")
    op.drop_index("ix_outbreak_alerts_disease", table_name="outbreak_alerts")
    op.drop_table("outbreak_alerts")
    op.execute("DROP TYPE IF EXISTS outbreakseverity")
    op.execute("DROP TYPE IF EXISTS transmissiontype")
