"""accounting engine - double-entry bookkeeping GL

Revision ID: q8f9g0h1i234
Revises: p7f0a1b2c345
Create Date: 2026-03-08

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "q8f9g0h1i234"
down_revision = "p7f0a1b2c345"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create enums explicitly (asyncpg safe) ──
    op.execute("DO $$ BEGIN CREATE TYPE accounttype AS ENUM ('asset','liability','equity','revenue','expense'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE accountsubtype AS ENUM ('current_asset','inventory','accounts_receivable','cash','prepaid','fixed_asset','accumulated_depreciation','biological_asset','current_liability','accounts_payable','tax_payable','long_term_liability','owners_equity','retained_earnings','sales_revenue','other_revenue','cogs','operating_expense','depreciation_expense','feed_expense','health_expense','labor_expense','utility_expense','other_expense'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE normalbalance AS ENUM ('debit','credit'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE periodstatus AS ENUM ('open','closed','locked'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE journalentrystatus AS ENUM ('draft','posted','reversed'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE journalentrysource AS ENUM ('manual','income','expense','receivable','inventory','feed','purchase_order','depreciation','cost_allocation','payroll','tax','adjustment','closing'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── GL Accounts (Chart of Accounts) ──
    op.create_table(
        "gl_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("account_type", sa.Enum("asset", "liability", "equity", "revenue", "expense", name="accounttype", create_type=False), nullable=False),
        sa.Column("sub_type", sa.Enum(
            "current_asset", "inventory", "accounts_receivable", "cash", "prepaid",
            "fixed_asset", "accumulated_depreciation", "biological_asset",
            "current_liability", "accounts_payable", "tax_payable", "long_term_liability",
            "owners_equity", "retained_earnings",
            "sales_revenue", "other_revenue",
            "cogs", "operating_expense", "depreciation_expense", "feed_expense",
            "health_expense", "labor_expense", "utility_expense", "other_expense",
            name="accountsubtype", create_type=False
        ), nullable=False),
        sa.Column("normal_balance", sa.Enum("debit", "credit", name="normalbalance", create_type=False), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("gl_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("is_system", sa.Boolean, server_default="false", nullable=False),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "code", name="uq_account_org_code"),
    )
    op.create_index("ix_gl_accounts_code", "gl_accounts", ["code"])
    op.create_index("ix_gl_accounts_org_type", "gl_accounts", ["organization_id", "account_type"])

    # ── Fiscal Periods ──
    op.create_table(
        "fiscal_periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("status", sa.Enum("open", "closed", "locked", name="periodstatus", create_type=False), server_default="open", nullable=False),
        sa.Column("closed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("closed_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "name", name="uq_period_org_name"),
        sa.CheckConstraint("end_date >= start_date", name="ck_period_dates"),
    )

    # ── Journal Entries (Header) ──
    op.create_table(
        "journal_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entry_number", sa.String(30), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("memo", sa.Text, nullable=True),
        sa.Column("status", sa.Enum("draft", "posted", "reversed", name="journalentrystatus", create_type=False), server_default="draft", nullable=False),
        sa.Column("source", sa.Enum(
            "manual", "income", "expense", "receivable", "inventory", "feed",
            "purchase_order", "depreciation", "cost_allocation", "payroll",
            "tax", "adjustment", "closing",
            name="journalentrysource", create_type=False
        ), server_default="manual", nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("period_id", UUID(as_uuid=True), sa.ForeignKey("fiscal_periods.id", ondelete="SET NULL"), nullable=True),
        sa.Column("posted_at", sa.DateTime, nullable=True),
        sa.Column("posted_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reversed_by_id", UUID(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_debit", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("total_credit", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "entry_number", name="uq_journal_org_number"),
        sa.CheckConstraint("total_debit = total_credit", name="ck_journal_balanced"),
    )
    op.create_index("ix_journal_entries_entry_number", "journal_entries", ["entry_number"])
    op.create_index("ix_journal_entries_date", "journal_entries", ["date"])
    op.create_index("ix_journal_org_date", "journal_entries", ["organization_id", "date"])
    op.create_index("ix_journal_source", "journal_entries", ["organization_id", "source", "source_id"])

    # ── Journal Entry Lines (Detail) ──
    op.create_table(
        "journal_entry_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("journal_entry_id", UUID(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("gl_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("description", sa.String(300), nullable=True),
        sa.Column("debit", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("credit", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("cost_center_id", UUID(as_uuid=True), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)",
            name="ck_line_one_side"
        ),
    )
    op.create_index("ix_jel_journal_entry_id", "journal_entry_lines", ["journal_entry_id"])
    op.create_index("ix_jel_account_id", "journal_entry_lines", ["account_id"])
    op.create_index("ix_jel_account_date", "journal_entry_lines", ["account_id", "journal_entry_id"])

    # ── Account Balances (Materialized) ──
    op.create_table(
        "account_balances",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("gl_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_id", UUID(as_uuid=True), sa.ForeignKey("fiscal_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("debit_total", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("credit_total", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("balance", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "account_id", "period_id", name="uq_balance_account_period"),
    )
    op.create_index("ix_account_balances_account_id", "account_balances", ["account_id"])
    op.create_index("ix_account_balances_period_id", "account_balances", ["period_id"])


def downgrade() -> None:
    op.drop_table("account_balances")
    op.drop_table("journal_entry_lines")
    op.drop_table("journal_entries")
    op.drop_table("fiscal_periods")
    op.drop_table("gl_accounts")
    op.execute("DROP TYPE IF EXISTS accounttype")
    op.execute("DROP TYPE IF EXISTS accountsubtype")
    op.execute("DROP TYPE IF EXISTS normalbalance")
    op.execute("DROP TYPE IF EXISTS journalentrystatus")
    op.execute("DROP TYPE IF EXISTS journalentrysource")
    op.execute("DROP TYPE IF EXISTS periodstatus")
