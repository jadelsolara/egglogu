"""
Accounting Engine — Double-Entry Bookkeeping Models

Core models for the FarmLogU accounting system:
- ChartOfAccounts: GL account structure (IFRS-compatible)
- FiscalPeriod: Accounting periods with open/closed state
- JournalEntry + JournalEntryLine: Double-entry transactions
- AccountBalance: Materialized running balances per account/period

Every financial transaction (income, expense, inventory movement, depreciation)
generates JournalEntry records. The General Ledger is the journal_entry_lines table.
Balance Sheet and Income Statement are computed from account balances.
"""

import uuid
import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    String, Text, Date, DateTime, Boolean, ForeignKey, Index,
    Numeric, Enum as SAEnum, UniqueConstraint, CheckConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


# ── Enums ────────────────────────────────────────────────────────────────

class AccountType(str, enum.Enum):
    """Top-level account classification (IFRS)."""
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class AccountSubType(str, enum.Enum):
    """Sub-classification for financial statement presentation."""
    # Assets
    CURRENT_ASSET = "current_asset"
    INVENTORY = "inventory"
    ACCOUNTS_RECEIVABLE = "accounts_receivable"
    CASH = "cash"
    PREPAID = "prepaid"
    FIXED_ASSET = "fixed_asset"
    ACCUMULATED_DEPRECIATION = "accumulated_depreciation"
    BIOLOGICAL_ASSET = "biological_asset"  # IAS 41 — livestock
    # Liabilities
    CURRENT_LIABILITY = "current_liability"
    ACCOUNTS_PAYABLE = "accounts_payable"
    TAX_PAYABLE = "tax_payable"
    LONG_TERM_LIABILITY = "long_term_liability"
    # Equity
    OWNERS_EQUITY = "owners_equity"
    RETAINED_EARNINGS = "retained_earnings"
    # Revenue
    SALES_REVENUE = "sales_revenue"
    OTHER_REVENUE = "other_revenue"
    # Expense
    COGS = "cogs"
    OPERATING_EXPENSE = "operating_expense"
    DEPRECIATION_EXPENSE = "depreciation_expense"
    FEED_EXPENSE = "feed_expense"
    HEALTH_EXPENSE = "health_expense"
    LABOR_EXPENSE = "labor_expense"
    UTILITY_EXPENSE = "utility_expense"
    OTHER_EXPENSE = "other_expense"


class NormalBalance(str, enum.Enum):
    """Accounting normal balance side."""
    DEBIT = "debit"
    CREDIT = "credit"


class JournalEntryStatus(str, enum.Enum):
    """Journal entry lifecycle."""
    DRAFT = "draft"
    POSTED = "posted"
    REVERSED = "reversed"


class JournalEntrySource(str, enum.Enum):
    """What generated this journal entry."""
    MANUAL = "manual"
    INCOME = "income"
    EXPENSE = "expense"
    RECEIVABLE = "receivable"
    INVENTORY = "inventory"
    FEED = "feed"
    PURCHASE_ORDER = "purchase_order"
    DEPRECIATION = "depreciation"
    COST_ALLOCATION = "cost_allocation"
    PAYROLL = "payroll"
    TAX = "tax"
    ADJUSTMENT = "adjustment"
    CLOSING = "closing"


class PeriodStatus(str, enum.Enum):
    """Fiscal period state."""
    OPEN = "open"
    CLOSED = "closed"
    LOCKED = "locked"  # Permanently closed (audited)


# ── Chart of Accounts ────────────────────────────────────────────────────

class Account(TimestampMixin, TenantMixin, Base):
    """General Ledger account in the Chart of Accounts.

    Standard numbering convention:
    1xxx = Assets, 2xxx = Liabilities, 3xxx = Equity,
    4xxx = Revenue, 5xxx = COGS, 6xxx = Operating Expenses
    """
    __tablename__ = "gl_accounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(200))
    account_type: Mapped[AccountType] = mapped_column(SAEnum(AccountType))
    sub_type: Mapped[AccountSubType] = mapped_column(SAEnum(AccountSubType))
    normal_balance: Mapped[NormalBalance] = mapped_column(SAEnum(NormalBalance))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("gl_accounts.id", ondelete="SET NULL"), default=None
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # Relationships
    parent: Mapped[Optional["Account"]] = relationship(
        remote_side="Account.id", back_populates="children"
    )
    children: Mapped[list["Account"]] = relationship(back_populates="parent")
    journal_lines: Mapped[list["JournalEntryLine"]] = relationship(
        back_populates="account"
    )
    balances: Mapped[list["AccountBalance"]] = relationship(back_populates="account")

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_account_org_code"),
        Index("ix_gl_accounts_org_type", "organization_id", "account_type"),
    )


# ── Fiscal Period ────────────────────────────────────────────────────────

class FiscalPeriod(TimestampMixin, TenantMixin, Base):
    """Accounting period (month or custom). Entries can only post to open periods."""
    __tablename__ = "fiscal_periods"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(50))  # e.g. "2026-03", "Q1 2026"
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[PeriodStatus] = mapped_column(
        SAEnum(PeriodStatus), default=PeriodStatus.OPEN
    )
    closed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=None)

    # Relationships
    journal_entries: Mapped[list["JournalEntry"]] = relationship(back_populates="period")
    account_balances: Mapped[list["AccountBalance"]] = relationship(back_populates="period")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_period_org_name"),
        CheckConstraint("end_date >= start_date", name="ck_period_dates"),
    )


# ── Journal Entry (Header) ──────────────────────────────────────────────

class JournalEntry(TimestampMixin, TenantMixin, Base):
    """Double-entry journal entry header. Sum of debits MUST equal sum of credits."""
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entry_number: Mapped[str] = mapped_column(String(30), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(String(500))
    memo: Mapped[Optional[str]] = mapped_column(Text, default=None)
    status: Mapped[JournalEntryStatus] = mapped_column(
        SAEnum(JournalEntryStatus), default=JournalEntryStatus.DRAFT
    )
    source: Mapped[JournalEntrySource] = mapped_column(
        SAEnum(JournalEntrySource), default=JournalEntrySource.MANUAL
    )
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(default=None)
    period_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("fiscal_periods.id", ondelete="SET NULL"), default=None
    )
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, default=None)
    posted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    reversed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="SET NULL"), default=None
    )
    total_debit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00")
    )
    total_credit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00")
    )

    # Relationships
    lines: Mapped[list["JournalEntryLine"]] = relationship(
        back_populates="journal_entry", cascade="all, delete-orphan"
    )
    period: Mapped[Optional["FiscalPeriod"]] = relationship(back_populates="journal_entries")

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "entry_number", name="uq_journal_org_number"
        ),
        CheckConstraint(
            "total_debit = total_credit",
            name="ck_journal_balanced"
        ),
        Index("ix_journal_org_date", "organization_id", "date"),
        Index("ix_journal_source", "organization_id", "source", "source_id"),
    )


# ── Journal Entry Line (Detail) ─────────────────────────────────────────

class JournalEntryLine(TimestampMixin, TenantMixin, Base):
    """Single debit or credit line in a journal entry.
    Each line touches exactly one GL account."""
    __tablename__ = "journal_entry_lines"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="CASCADE"), index=True
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gl_accounts.id", ondelete="RESTRICT"), index=True
    )
    description: Mapped[Optional[str]] = mapped_column(String(300), default=None)
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    cost_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), default=None
    )

    # Relationships
    journal_entry: Mapped["JournalEntry"] = relationship(back_populates="lines")
    account: Mapped["Account"] = relationship(back_populates="journal_lines")

    __table_args__ = (
        CheckConstraint(
            "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)",
            name="ck_line_one_side"
        ),
        Index("ix_jel_account_date", "account_id", "journal_entry_id"),
    )


# ── Account Balance (Materialized) ──────────────────────────────────────

class AccountBalance(TimestampMixin, TenantMixin, Base):
    """Materialized balance per account per period.
    Updated when journal entries are posted. Enables fast financial statements."""
    __tablename__ = "account_balances"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("gl_accounts.id", ondelete="CASCADE"), index=True
    )
    period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fiscal_periods.id", ondelete="CASCADE"), index=True
    )
    debit_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00")
    )
    credit_total: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00")
    )
    balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0.00")
    )

    # Relationships
    account: Mapped["Account"] = relationship(back_populates="balances")
    period: Mapped["FiscalPeriod"] = relationship(back_populates="account_balances")

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "account_id", "period_id",
            name="uq_balance_account_period"
        ),
    )
