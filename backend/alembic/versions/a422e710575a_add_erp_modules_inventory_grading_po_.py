"""add_erp_modules_inventory_grading_po_audit_compliance_costcenter

Revision ID: a422e710575a
Revises: a1b2c3d4e567
Create Date: 2026-02-24 20:38:16.112314

Creates 13 ERP tables: warehouse_locations, egg_stock, stock_movements,
packaging_materials, grading_sessions, suppliers, purchase_orders,
cost_centers, cost_allocations, profit_loss_snapshots,
compliance_certifications, compliance_inspections, salmonella_tests.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


# revision identifiers, used by Alembic.
revision: str = 'a422e710575a'
down_revision: Union[str, None] = 'a1b2c3d4e567'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Create enums explicitly (asyncpg safe) ──
    op.execute("DO $$ BEGIN CREATE TYPE stockmovementtype AS ENUM ('production_in','sale_out','breakage','adjustment','transfer','return_in'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE packagingtype AS ENUM ('tray_30','carton_6','carton_10','carton_12','bulk_case','pallet'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE postatus AS ENUM ('draft','submitted','approved','ordered','partially_received','received','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE pocategory AS ENUM ('feed','medication','packaging','equipment','pullets','cleaning','other'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE costcentertype AS ENUM ('farm','flock','herd','field','warehouse','transport','processing','admin','custom'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE costcategory AS ENUM ('feed','medication','labor','energy','water','packaging','transport','maintenance','depreciation','insurance','veterinary','cleaning','pullet_amortization','piglet_purchase','slaughter','calf_purchase','milking_supplies','seed','fertilizer','pesticide','irrigation','land_lease','other'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE allocationmethod AS ENUM ('direct','proportional_units','proportional_production','proportional_revenue','equal_split','manual','proportional_birds'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE complianceframework AS ENUM ('senasica','ica','eu','usda','haccp','organic','free_range','custom'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE inspectionstatus AS ENUM ('scheduled','in_progress','passed','failed','remediation'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── 1. warehouse_locations ──
    op.create_table(
        "warehouse_locations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("location_type", sa.String(50), server_default="storage", nullable=False),
        sa.Column("capacity_units", sa.Integer, nullable=True),
        sa.Column("temp_controlled", sa.Boolean, server_default="false", nullable=False),
        sa.Column("temp_min_c", sa.Float, nullable=True),
        sa.Column("temp_max_c", sa.Float, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 2. egg_stock ──
    op.create_table(
        "egg_stock",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("location_id", UUID(as_uuid=True),
                  sa.ForeignKey("warehouse_locations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("flock_id", UUID(as_uuid=True),
                  sa.ForeignKey("flocks.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("date", sa.Date, nullable=False, index=True),
        sa.Column("egg_size", sa.String(20), nullable=False),
        sa.Column("egg_type", sa.String(50), nullable=True),
        sa.Column("quality_grade", sa.String(10), nullable=True),
        sa.Column("quantity", sa.Integer, server_default="0", nullable=False),
        sa.Column("packaging", sa.String(50), nullable=True),
        sa.Column("batch_code", sa.String(100), nullable=True, index=True),
        sa.Column("best_before", sa.Date, nullable=True),
        sa.Column("unit_cost", sa.Float, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 3. stock_movements ──
    op.create_table(
        "stock_movements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("stock_id", UUID(as_uuid=True),
                  sa.ForeignKey("egg_stock.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("movement_type", sa.Enum("production_in","sale_out","breakage","adjustment","transfer","return_in", name="stockmovementtype", create_type=False), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("date", sa.Date, nullable=False, index=True),
        sa.Column("reference", sa.String(200), nullable=True),
        sa.Column("from_location_id", UUID(as_uuid=True),
                  sa.ForeignKey("warehouse_locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_location_id", UUID(as_uuid=True),
                  sa.ForeignKey("warehouse_locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 4. packaging_materials ──
    op.create_table(
        "packaging_materials",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("packaging_type", sa.Enum("tray_30","carton_6","carton_10","carton_12","bulk_case","pallet", name="packagingtype", create_type=False), nullable=False),
        sa.Column("quantity_on_hand", sa.Integer, server_default="0", nullable=False),
        sa.Column("reorder_level", sa.Integer, server_default="0", nullable=False),
        sa.Column("unit_cost", sa.Float, nullable=True),
        sa.Column("supplier", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 5. grading_sessions ──
    op.create_table(
        "grading_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("flock_id", UUID(as_uuid=True),
                  sa.ForeignKey("flocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date", sa.Date, nullable=False, index=True),
        sa.Column("total_graded", sa.Integer, server_default="0", nullable=False),
        sa.Column("grade_aa", sa.Integer, server_default="0", nullable=False),
        sa.Column("grade_a", sa.Integer, server_default="0", nullable=False),
        sa.Column("grade_b", sa.Integer, server_default="0", nullable=False),
        sa.Column("rejected", sa.Integer, server_default="0", nullable=False),
        sa.Column("dirty", sa.Integer, server_default="0", nullable=False),
        sa.Column("cracked", sa.Integer, server_default="0", nullable=False),
        sa.Column("avg_weight_g", sa.Float, nullable=True),
        sa.Column("shell_strength", sa.Float, nullable=True),
        sa.Column("haugh_unit", sa.Float, nullable=True),
        sa.Column("yolk_color_score", sa.Integer, nullable=True),
        sa.Column("grader_id", sa.String(100), nullable=True),
        sa.Column("machine_id", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 6. suppliers ──
    op.create_table(
        "suppliers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_name", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("tax_id", sa.String(50), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("payment_terms_days", sa.Integer, server_default="30", nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 7. purchase_orders ──
    op.create_table(
        "purchase_orders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("po_number", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("supplier_id", UUID(as_uuid=True),
                  sa.ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.Enum("draft","submitted","approved","ordered","partially_received","received","cancelled", name="postatus", create_type=False), server_default="draft", nullable=False),
        sa.Column("category", sa.Enum("feed","medication","packaging","equipment","pullets","cleaning","other", name="pocategory", create_type=False), server_default="other", nullable=False),
        sa.Column("order_date", sa.Date, nullable=False),
        sa.Column("expected_delivery", sa.Date, nullable=True),
        sa.Column("actual_delivery", sa.Date, nullable=True),
        sa.Column("subtotal", sa.Float, server_default="0.0", nullable=False),
        sa.Column("tax", sa.Float, server_default="0.0", nullable=False),
        sa.Column("total", sa.Float, server_default="0.0", nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("approved_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 8. cost_centers ──
    op.create_table(
        "cost_centers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False, index=True),
        sa.Column("center_type", sa.Enum("farm","flock","herd","field","warehouse","transport","processing","admin","custom", name="costcentertype", create_type=False), server_default="flock", nullable=False),
        sa.Column("farm_id", UUID(as_uuid=True),
                  sa.ForeignKey("farms.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("flock_id", UUID(as_uuid=True),
                  sa.ForeignKey("flocks.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("parent_center_id", UUID(as_uuid=True),
                  sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("budget_monthly", sa.Float, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 9. cost_allocations ──
    op.create_table(
        "cost_allocations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cost_center_id", UUID(as_uuid=True),
                  sa.ForeignKey("cost_centers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date", sa.Date, nullable=False, index=True),
        sa.Column("category", sa.Enum("feed","medication","labor","energy","water","packaging","transport","maintenance","depreciation","insurance","veterinary","cleaning","pullet_amortization","piglet_purchase","slaughter","calf_purchase","milking_supplies","seed","fertilizer","pesticide","irrigation","land_lease","other", name="costcategory", create_type=False), nullable=False),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("allocation_method", sa.Enum("direct","proportional_units","proportional_production","proportional_revenue","equal_split","manual","proportional_birds", name="allocationmethod", create_type=False), server_default="direct", nullable=False),
        sa.Column("allocation_pct", sa.Float, server_default="100.0", nullable=False),
        sa.Column("source_expense_id", UUID(as_uuid=True),
                  sa.ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_po_id", UUID(as_uuid=True),
                  sa.ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 10. profit_loss_snapshots ──
    op.create_table(
        "profit_loss_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("cost_center_id", UUID(as_uuid=True),
                  sa.ForeignKey("cost_centers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("period_start", sa.Date, nullable=False, index=True),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("total_revenue", sa.Float, server_default="0.0", nullable=False),
        sa.Column("total_cost", sa.Float, server_default="0.0", nullable=False),
        sa.Column("gross_profit", sa.Float, server_default="0.0", nullable=False),
        sa.Column("margin_pct", sa.Float, server_default="0.0", nullable=False),
        sa.Column("cost_breakdown", JSON, nullable=True),
        sa.Column("revenue_breakdown", JSON, nullable=True),
        sa.Column("eggs_produced", sa.Integer, nullable=True),
        sa.Column("eggs_sold", sa.Integer, nullable=True),
        sa.Column("cost_per_egg", sa.Float, nullable=True),
        sa.Column("cost_per_dozen", sa.Float, nullable=True),
        sa.Column("unit_of_measure", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 11. compliance_certifications ──
    op.create_table(
        "compliance_certifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("framework", sa.Enum("senasica","ica","eu","usda","haccp","organic","free_range","custom", name="complianceframework", create_type=False), nullable=False, index=True),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("certificate_number", sa.String(100), nullable=True),
        sa.Column("issued_date", sa.Date, nullable=True),
        sa.Column("expiry_date", sa.Date, nullable=True, index=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("issuing_authority", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("document_ref", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 12. compliance_inspections ──
    op.create_table(
        "compliance_inspections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("framework", sa.Enum("senasica","ica","eu","usda","haccp","organic","free_range","custom", name="complianceframework", create_type=False), nullable=False, index=True),
        sa.Column("inspection_type", sa.String(100), nullable=False),
        sa.Column("scheduled_date", sa.Date, nullable=False, index=True),
        sa.Column("completed_date", sa.Date, nullable=True),
        sa.Column("inspector_name", sa.String(200), nullable=True),
        sa.Column("status", sa.Enum("scheduled","in_progress","passed","failed","remediation", name="inspectionstatus", create_type=False), server_default="scheduled", nullable=False),
        sa.Column("findings", sa.Text, nullable=True),
        sa.Column("corrective_actions", sa.Text, nullable=True),
        sa.Column("score", sa.String(50), nullable=True),
        sa.Column("next_inspection", sa.Date, nullable=True),
        sa.Column("checklist_json", JSON, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )

    # ── 13. salmonella_tests ──
    op.create_table(
        "salmonella_tests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("flock_id", UUID(as_uuid=True),
                  sa.ForeignKey("flocks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sample_date", sa.Date, nullable=False, index=True),
        sa.Column("lab_name", sa.String(200), nullable=True),
        sa.Column("sample_type", sa.String(100), server_default="environment", nullable=False),
        sa.Column("result", sa.String(20), server_default="pending", nullable=False),
        sa.Column("result_date", sa.Date, nullable=True),
        sa.Column("serotype", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.drop_table("salmonella_tests")
    op.drop_table("compliance_inspections")
    op.drop_table("compliance_certifications")
    op.drop_table("profit_loss_snapshots")
    op.drop_table("cost_allocations")
    op.drop_table("cost_centers")
    op.drop_table("purchase_orders")
    op.drop_table("suppliers")
    op.drop_table("grading_sessions")
    op.drop_table("packaging_materials")
    op.drop_table("stock_movements")
    op.drop_table("egg_stock")
    op.drop_table("warehouse_locations")

    # Drop enums
    op.execute("DROP TYPE IF EXISTS inspectionstatus")
    op.execute("DROP TYPE IF EXISTS complianceframework")
    op.execute("DROP TYPE IF EXISTS allocationmethod")
    op.execute("DROP TYPE IF EXISTS costcategory")
    op.execute("DROP TYPE IF EXISTS costcentertype")
    op.execute("DROP TYPE IF EXISTS pocategory")
    op.execute("DROP TYPE IF EXISTS postatus")
    op.execute("DROP TYPE IF EXISTS packagingtype")
    op.execute("DROP TYPE IF EXISTS stockmovementtype")
