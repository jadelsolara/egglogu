"""Enable PostgreSQL Row-Level Security for multi-tenant isolation

Revision ID: l3a4b5c6d789
Revises: k2f3a4b5c678
Create Date: 2026-03-03 10:30:00.000000

Adds RLS policies to all tables with organization_id (TenantMixin).
The app sets `app.current_org` via SET LOCAL at the start of each request.
Manual `.where(organization_id == ...)` filters are kept as defense-in-depth.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "l3a4b5c6d789"
down_revision: Union[str, None] = "k2f3a4b5c678"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All tables using TenantMixin (organization_id UUID FK)
RLS_TABLES = [
    "farms",
    "flocks",
    "breed_curves",
    "daily_production",
    "vaccines",
    "medications",
    "outbreaks",
    "stress_events",
    "feed_purchases",
    "feed_consumption",
    "clients",
    "incomes",
    "expenses",
    "receivables",
    "environment_readings",
    "iot_readings",
    "weather_cache",
    "checklist_items",
    "logbook_entries",
    "personnel",
    "kpi_snapshots",
    "predictions",
    "biosecurity_visitors",
    "biosecurity_zones",
    "pest_sightings",
    "biosecurity_protocols",
    "traceability_batches",
    "production_plans",
    "support_tickets",
    "warehouse_locations",
    "egg_stock",
    "stock_movements",
    "packaging_materials",
    "grading_sessions",
    "suppliers",
    "purchase_orders",
    "cost_centers",
    "cost_allocations",
    "profit_loss_snapshots",
    "compliance_certifications",
    "compliance_inspections",
    "salmonella_tests",
    "report_schedules",
    "report_executions",
    "workflow_rules",
    "workflow_executions",
    "customer_notes",
    "manual_discounts",
    "retention_rules",
    "retention_events",
    "credit_notes",
]


def _table_has_org_id(conn, table_name: str) -> bool:
    """Check if a table exists AND has organization_id column."""
    result = conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t "
        "AND column_name = 'organization_id'"
    ), {"t": table_name})
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()
    existing = [t for t in RLS_TABLES if _table_has_org_id(conn, t)]

    for table in existing:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            CREATE POLICY tenant_isolation_{table} ON {table}
            USING (
                organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
            )
            WITH CHECK (
                organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid
            )
        """)

    for table in existing:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    conn = op.get_bind()
    existing = [t for t in RLS_TABLES if _table_has_org_id(conn, t)]

    for table in existing:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
