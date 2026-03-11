"""F0 close: add TenantMixin to 6 models, SoftDeleteMixin to 7 models, add 10+ indexes

Revision ID: w4l5m6n7o890
Revises: v3k4l5m6n789
Create Date: 2026-03-11

TIER 1 — Multi-tenant isolation:
  PurchaseOrderItem, TraceEventItem, RecallBatch, WebhookDelivery,
  TicketMessage, SupportRating → add organization_id FK

TIER 2 — Data integrity (soft delete):
  Client, FeedPurchase, WarehouseLocation, PackagingMaterial,
  Supplier, ChecklistItem, Personnel → add deleted_at column

TIER 3 — Performance indexes:
  IoTReading, WeatherCache, EnvironmentReading, LogbookEntry,
  FAQArticle, AutoResponse, WebhookDelivery, AuditLog
"""

from alembic import op
import sqlalchemy as sa

revision = "w4l5m6n7o890"
down_revision = "v3k4l5m6n789"


def upgrade() -> None:
    # ═══════════════════════════════════════════
    # TIER 1: Add organization_id FK (TenantMixin)
    # ═══════════════════════════════════════════

    for table in [
        "purchase_order_items",
        "trace_event_items",
        "recall_batches",
        "webhook_deliveries",
        "ticket_messages",
        "support_ratings",
    ]:
        op.add_column(
            table,
            sa.Column(
                "organization_id",
                sa.UUID(),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=True,  # Initially nullable for existing rows
            ),
        )
        op.create_index(f"ix_{table}_organization_id", table, ["organization_id"])

    # Backfill organization_id from parent tables
    # PurchaseOrderItem → PurchaseOrder.organization_id
    op.execute("""
        UPDATE purchase_order_items poi
        SET organization_id = po.organization_id
        FROM purchase_orders po
        WHERE poi.purchase_order_id = po.id
    """)

    # TraceEventItem → TraceEvent.organization_id
    op.execute("""
        UPDATE trace_event_items tei
        SET organization_id = te.organization_id
        FROM trace_events te
        WHERE tei.event_id = te.id
    """)

    # RecallBatch → TraceRecall.organization_id
    op.execute("""
        UPDATE recall_batches rb
        SET organization_id = tr.organization_id
        FROM trace_recalls tr
        WHERE rb.recall_id = tr.id
    """)

    # WebhookDelivery → Webhook.organization_id
    op.execute("""
        UPDATE webhook_deliveries wd
        SET organization_id = w.organization_id
        FROM webhooks w
        WHERE wd.webhook_id = w.id
    """)

    # TicketMessage → SupportTicket.organization_id
    op.execute("""
        UPDATE ticket_messages tm
        SET organization_id = st.organization_id
        FROM support_tickets st
        WHERE tm.ticket_id = st.id
    """)

    # SupportRating → SupportTicket.organization_id
    op.execute("""
        UPDATE support_ratings sr
        SET organization_id = st.organization_id
        FROM support_tickets st
        WHERE sr.ticket_id = st.id
    """)

    # Now make organization_id NOT NULL (after backfill)
    for table in [
        "purchase_order_items",
        "trace_event_items",
        "recall_batches",
        "webhook_deliveries",
        "ticket_messages",
        "support_ratings",
    ]:
        op.alter_column(table, "organization_id", nullable=False)

    # WebhookDelivery: add updated_at (TimestampMixin) — created_at already exists
    op.add_column(
        "webhook_deliveries",
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # ═══════════════════════════════════════════
    # TIER 2: Add deleted_at column (SoftDeleteMixin)
    # ═══════════════════════════════════════════

    for table in [
        "clients",
        "feed_purchases",
        "warehouse_locations",
        "packaging_materials",
        "suppliers",
        "checklist_items",
        "personnel",
    ]:
        op.add_column(
            table,
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
        )

    # ═══════════════════════════════════════════
    # TIER 3: Add performance indexes
    # ═══════════════════════════════════════════

    # IoTReading: timestamp + compound index
    op.create_index("ix_iot_readings_timestamp", "iot_readings", ["timestamp"])
    op.create_index("ix_iot_readings_sensor_type", "iot_readings", ["sensor_type"])
    op.create_index(
        "ix_iot_org_sensor_ts",
        "iot_readings",
        ["organization_id", "sensor_type", "timestamp"],
    )

    # WeatherCache: timestamp
    op.create_index("ix_weather_cache_timestamp", "weather_cache", ["timestamp"])

    # EnvironmentReading: date + compound index
    op.create_index("ix_environment_readings_date", "environment_readings", ["date"])
    op.create_index(
        "ix_env_reading_org_date",
        "environment_readings",
        ["organization_id", "date"],
    )

    # LogbookEntry: date
    op.create_index("ix_logbook_entries_date", "logbook_entries", ["date"])

    # FAQArticle: category + is_published
    op.create_index("ix_faq_articles_category", "faq_articles", ["category"])
    op.create_index("ix_faq_articles_is_published", "faq_articles", ["is_published"])

    # AutoResponse: is_active
    op.create_index("ix_auto_responses_is_active", "auto_responses", ["is_active"])

    # WebhookDelivery: success
    op.create_index("ix_webhook_deliveries_success", "webhook_deliveries", ["success"])

    # AuditLog: compound org+timestamp
    op.create_index(
        "ix_audit_org_timestamp",
        "audit_logs",
        ["organization_id", "timestamp"],
    )


def downgrade() -> None:
    # Drop indexes (TIER 3)
    op.drop_index("ix_audit_org_timestamp", "audit_logs")
    op.drop_index("ix_webhook_deliveries_success", "webhook_deliveries")
    op.drop_index("ix_auto_responses_is_active", "auto_responses")
    op.drop_index("ix_faq_articles_is_published", "faq_articles")
    op.drop_index("ix_faq_articles_category", "faq_articles")
    op.drop_index("ix_logbook_entries_date", "logbook_entries")
    op.drop_index("ix_env_reading_org_date", "environment_readings")
    op.drop_index("ix_environment_readings_date", "environment_readings")
    op.drop_index("ix_weather_cache_timestamp", "weather_cache")
    op.drop_index("ix_iot_org_sensor_ts", "iot_readings")
    op.drop_index("ix_iot_readings_sensor_type", "iot_readings")
    op.drop_index("ix_iot_readings_timestamp", "iot_readings")

    # Drop WebhookDelivery updated_at
    op.drop_column("webhook_deliveries", "updated_at")

    # Drop deleted_at columns (TIER 2)
    for table in [
        "personnel",
        "checklist_items",
        "suppliers",
        "packaging_materials",
        "warehouse_locations",
        "feed_purchases",
        "clients",
    ]:
        op.drop_column(table, "deleted_at")

    # Drop organization_id columns (TIER 1)
    for table in [
        "support_ratings",
        "ticket_messages",
        "webhook_deliveries",
        "recall_batches",
        "trace_event_items",
        "purchase_order_items",
    ]:
        op.drop_index(f"ix_{table}_organization_id", table)
        op.drop_column(table, "organization_id")
