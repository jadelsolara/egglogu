"""Add reports and workflows tables for enterprise features

Revision ID: j1e2f3a4b567
Revises: i0d1e2f3a456
Create Date: 2026-03-02 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "j1e2f3a4b567"
down_revision: Union[str, None] = "i0d1e2f3a456"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Create enums explicitly (asyncpg safe) ──
    op.execute("DO $$ BEGIN CREATE TYPE reporttemplate AS ENUM ('production','financial','health','feed','kpi'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE reportfrequency AS ENUM ('daily','weekly','monthly'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE workflowtrigger AS ENUM ('data_change','schedule','threshold'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── Report Schedules ──
    op.create_table(
        "report_schedules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "farm_id",
            sa.Uuid(),
            sa.ForeignKey("farms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "template",
            sa.Enum("production", "financial", "health", "feed", "kpi", name="reporttemplate", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "frequency",
            sa.Enum("daily", "weekly", "monthly", name="reportfrequency", create_type=False),
            nullable=False,
        ),
        sa.Column("recipients", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("params", postgresql.JSONB(), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ── Report Executions ──
    op.create_table(
        "report_executions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "schedule_id",
            sa.Uuid(),
            sa.ForeignKey("report_schedules.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "farm_id",
            sa.Uuid(),
            sa.ForeignKey("farms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "template",
            sa.Enum("production", "financial", "health", "feed", "kpi", name="reporttemplate", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "triggered_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("recipients_sent", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("result_summary", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ── Workflow Rules ──
    op.create_table(
        "workflow_rules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "farm_id",
            sa.Uuid(),
            sa.ForeignKey("farms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("preset", sa.String(50), nullable=True),
        sa.Column(
            "trigger_type",
            sa.Enum("data_change", "schedule", "threshold", name="workflowtrigger", create_type=False),
            nullable=False,
        ),
        sa.Column("conditions", postgresql.JSONB(), nullable=False),
        sa.Column("actions", postgresql.JSONB(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ── Workflow Executions ──
    op.create_table(
        "workflow_executions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "rule_id",
            sa.Uuid(),
            sa.ForeignKey("workflow_rules.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "farm_id",
            sa.Uuid(),
            sa.ForeignKey("farms.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("triggered_by", sa.String(50), nullable=False),
        sa.Column("conditions_matched", postgresql.JSONB(), nullable=True),
        sa.Column("actions_executed", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("workflow_executions")
    op.drop_table("workflow_rules")
    op.drop_table("report_executions")
    op.drop_table("report_schedules")
    op.execute("DROP TYPE IF EXISTS workflowtrigger")
    op.execute("DROP TYPE IF EXISTS reportfrequency")
    op.execute("DROP TYPE IF EXISTS reporttemplate")
