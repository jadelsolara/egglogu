"""EPCIS 2.0 traceability events — locations, events, lineage, recalls

Revision ID: s0h1i2j3k456
Revises: r9g0h1i2j345
Create Date: 2026-03-08

Adds EPCIS 2.0 compliant event logging, GS1 location registry,
batch lineage (transformation chains), and recall management.
Also adds GS1 identifiers (GTIN, SSCC, TLC) to traceability_batches.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "s0h1i2j3k456"
down_revision = "r9g0h1i2j345"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create enums explicitly (asyncpg safe) ──
    op.execute("DO $$ BEGIN CREATE TYPE traceeventtype AS ENUM ('object','aggregation','transformation','transaction'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE traceeventaction AS ENUM ('add','observe','delete'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE criticaltrackingevent AS ENUM ('growing','harvesting','cooling','initial_packing','shipping','receiving','transformation','storing','selling','recalling'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE tracelocationtype AS ENUM ('farm','field','house','packing_shed','warehouse','cold_storage','processing_plant','distribution_center','retail','transport'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE recallstatus AS ENUM ('draft','active','completed','cancelled','mock'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE recallscope AS ENUM ('batch','product','location','supplier','date_range'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── Add GS1 identifiers to traceability_batches ──
    op.add_column("traceability_batches", sa.Column("gtin", sa.String(14), nullable=True))
    op.add_column("traceability_batches", sa.Column("sscc", sa.String(18), nullable=True))
    op.add_column("traceability_batches", sa.Column("tlc", sa.String(100), nullable=True))

    # ── trace_locations ──
    op.create_table(
        "trace_locations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("gln", sa.String(13), unique=True, nullable=True),
        sa.Column("location_type", sa.Enum("farm","field","house","packing_shed","warehouse","cold_storage","processing_plant","distribution_center","retail","transport", name="tracelocationtype", create_type=False), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("country", sa.String(3), nullable=True),
        sa.Column("latitude", sa.Float, nullable=True),
        sa.Column("longitude", sa.Float, nullable=True),
        sa.Column("farm_id", UUID(as_uuid=True),
                  sa.ForeignKey("farms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("warehouse_id", UUID(as_uuid=True),
                  sa.ForeignKey("warehouse_locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contact_name", sa.String(200), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("contact_email", sa.String(200), nullable=True),
        sa.Column("certifications_data", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_trace_loc_gln", "trace_locations", ["gln"])
    op.create_index("ix_trace_loc_org", "trace_locations", ["organization_id"])
    op.create_index("ix_trace_loc_type", "trace_locations", ["location_type"])

    # ── trace_events ──
    op.create_table(
        "trace_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.Enum("object","aggregation","transformation","transaction", name="traceeventtype", create_type=False), nullable=False),
        sa.Column("action", sa.Enum("add","observe","delete", name="traceeventaction", create_type=False), nullable=False, server_default="observe"),
        sa.Column("cte", sa.Enum("growing","harvesting","cooling","initial_packing","shipping","receiving","transformation","storing","selling","recalling", name="criticaltrackingevent", create_type=False), nullable=False),
        sa.Column("event_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_timezone", sa.String(50), nullable=True),
        sa.Column("record_time", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("location_id", UUID(as_uuid=True),
                  sa.ForeignKey("trace_locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("read_point", sa.String(200), nullable=True),
        sa.Column("source_location_id", UUID(as_uuid=True),
                  sa.ForeignKey("trace_locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("destination_location_id", UUID(as_uuid=True),
                  sa.ForeignKey("trace_locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recorded_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("batch_id", UUID(as_uuid=True),
                  sa.ForeignKey("traceability_batches.id", ondelete="CASCADE"), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("disposition", sa.String(100), nullable=True),
        sa.Column("biz_transaction_type", sa.String(50), nullable=True),
        sa.Column("biz_transaction_id", sa.String(100), nullable=True),
        sa.Column("carrier", sa.String(200), nullable=True),
        sa.Column("vehicle_id", sa.String(100), nullable=True),
        sa.Column("sscc", sa.String(18), nullable=True),
        sa.Column("temperature_c", sa.Float, nullable=True),
        sa.Column("humidity_pct", sa.Float, nullable=True),
        sa.Column("kde_data", sa.JSON, nullable=True),
        sa.Column("event_hash", sa.String(64), nullable=True),
        sa.Column("prev_event_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_trace_event_batch", "trace_events", ["batch_id"])
    op.create_index("ix_trace_event_time", "trace_events", ["event_time"])
    op.create_index("ix_trace_event_cte", "trace_events", ["cte"])
    op.create_index("ix_trace_event_org", "trace_events", ["organization_id"])
    op.create_index("ix_trace_event_loc", "trace_events", ["location_id"])

    # ── trace_event_items ──
    op.create_table(
        "trace_event_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", UUID(as_uuid=True),
                  sa.ForeignKey("trace_events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("batch_id", UUID(as_uuid=True),
                  sa.ForeignKey("traceability_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=True),
        sa.Column("unit_of_measure", sa.String(20), nullable=True),
        sa.Column("gtin", sa.String(14), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_event_items_event", "trace_event_items", ["event_id"])
    op.create_index("ix_event_items_batch", "trace_event_items", ["batch_id"])

    # ── batch_lineage ──
    op.create_table(
        "batch_lineage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("parent_batch_id", UUID(as_uuid=True),
                  sa.ForeignKey("traceability_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("child_batch_id", UUID(as_uuid=True),
                  sa.ForeignKey("traceability_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transformation_event_id", UUID(as_uuid=True),
                  sa.ForeignKey("trace_events.id", ondelete="SET NULL"), nullable=True),
        sa.Column("quantity_consumed", sa.Float, nullable=True),
        sa.Column("unit_of_measure", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("parent_batch_id", "child_batch_id", name="uq_lineage_parent_child"),
    )
    op.create_index("ix_lineage_parent", "batch_lineage", ["parent_batch_id"])
    op.create_index("ix_lineage_child", "batch_lineage", ["child_batch_id"])

    # ── trace_recalls ──
    op.create_table(
        "trace_recalls",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recall_number", sa.String(50), unique=True, nullable=False),
        sa.Column("status", sa.Enum("draft","active","completed","cancelled","mock", name="recallstatus", create_type=False), nullable=False, server_default="draft"),
        sa.Column("scope", sa.Enum("batch","product","location","supplier","date_range", name="recallscope", create_type=False), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("trigger_batch_id", UUID(as_uuid=True),
                  sa.ForeignKey("traceability_batches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_category", sa.String(50), nullable=True),
        sa.Column("date_from", sa.Date, nullable=True),
        sa.Column("date_to", sa.Date, nullable=True),
        sa.Column("initiated_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("initiated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("batches_affected", sa.Integer, server_default="0", nullable=False),
        sa.Column("units_affected", sa.Integer, server_default="0", nullable=False),
        sa.Column("units_recovered", sa.Integer, server_default="0", nullable=False),
        sa.Column("clients_notified", sa.Integer, server_default="0", nullable=False),
        sa.Column("trace_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trace_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_recall_org", "trace_recalls", ["organization_id"])
    op.create_index("ix_recall_status", "trace_recalls", ["status"])

    # ── recall_batches ──
    op.create_table(
        "recall_batches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("recall_id", UUID(as_uuid=True),
                  sa.ForeignKey("trace_recalls.id", ondelete="CASCADE"), nullable=False),
        sa.Column("batch_id", UUID(as_uuid=True),
                  sa.ForeignKey("traceability_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True),
                  sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notification_sent", sa.Boolean, server_default="false", nullable=False),
        sa.Column("notification_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("units_in_batch", sa.Integer, server_default="0", nullable=False),
        sa.Column("units_recovered", sa.Integer, server_default="0", nullable=False),
        sa.Column("recovery_date", sa.Date, nullable=True),
        sa.Column("disposition", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("recall_id", "batch_id", name="uq_recall_batch"),
    )
    op.create_index("ix_recall_batches_recall", "recall_batches", ["recall_id"])
    op.create_index("ix_recall_batches_batch", "recall_batches", ["batch_id"])


def downgrade() -> None:
    op.drop_table("recall_batches")
    op.drop_table("trace_recalls")
    op.drop_table("batch_lineage")
    op.drop_table("trace_event_items")
    op.drop_table("trace_events")
    op.drop_table("trace_locations")

    op.drop_column("traceability_batches", "tlc")
    op.drop_column("traceability_batches", "sscc")
    op.drop_column("traceability_batches", "gtin")

    op.execute("DROP TYPE IF EXISTS recallscope")
    op.execute("DROP TYPE IF EXISTS recallstatus")
    op.execute("DROP TYPE IF EXISTS tracelocationtype")
    op.execute("DROP TYPE IF EXISTS criticaltrackingevent")
    op.execute("DROP TYPE IF EXISTS traceeventaction")
    op.execute("DROP TYPE IF EXISTS traceeventtype")
