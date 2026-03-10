"""Pydantic v2 schemas for the Accounting Engine."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from src.models.accounting import (
    AccountType,
    AccountSubType,
    NormalBalance,
    JournalEntryStatus,
    JournalEntrySource,
    PeriodStatus,
)


# ── Chart of Accounts ────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=200)
    account_type: AccountType
    sub_type: AccountSubType
    normal_balance: NormalBalance
    description: Optional[str] = Field(default=None, max_length=2000)
    parent_id: Optional[uuid.UUID] = None
    is_active: bool = True
    currency: str = Field(default="USD", max_length=3)


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    parent_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    currency: Optional[str] = Field(default=None, max_length=3)


class AccountRead(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    account_type: AccountType
    sub_type: AccountSubType
    normal_balance: NormalBalance
    description: Optional[str]
    parent_id: Optional[uuid.UUID]
    is_active: bool
    is_system: bool
    currency: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Fiscal Period ────────────────────────────────────────────────────────

class FiscalPeriodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class FiscalPeriodUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    status: Optional[PeriodStatus] = None


class FiscalPeriodRead(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date
    end_date: date
    status: PeriodStatus
    closed_by: Optional[uuid.UUID]
    closed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Journal Entry ────────────────────────────────────────────────────────

class JournalEntryLineCreate(BaseModel):
    account_id: uuid.UUID
    description: Optional[str] = Field(default=None, max_length=300)
    debit: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    credit: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    cost_center_id: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def one_side_only(self):
        if self.debit > 0 and self.credit > 0:
            raise ValueError("A line must be either debit or credit, not both")
        if self.debit == 0 and self.credit == 0:
            raise ValueError("A line must have a non-zero debit or credit")
        return self


class JournalEntryCreate(BaseModel):
    date: date
    description: str = Field(min_length=1, max_length=500)
    memo: Optional[str] = Field(default=None, max_length=2000)
    source: JournalEntrySource = JournalEntrySource.MANUAL
    source_id: Optional[uuid.UUID] = None
    period_id: Optional[uuid.UUID] = None
    lines: list[JournalEntryLineCreate] = Field(min_length=2)

    @model_validator(mode="after")
    def check_balanced(self):
        total_debit = sum(line.debit for line in self.lines)
        total_credit = sum(line.credit for line in self.lines)
        if total_debit != total_credit:
            raise ValueError(
                f"Entry not balanced: debits={total_debit} != credits={total_credit}"
            )
        return self


class JournalEntryLineRead(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    description: Optional[str]
    debit: Decimal
    credit: Decimal
    cost_center_id: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class JournalEntryRead(BaseModel):
    id: uuid.UUID
    entry_number: str
    date: date
    description: str
    memo: Optional[str]
    status: JournalEntryStatus
    source: JournalEntrySource
    source_id: Optional[uuid.UUID]
    period_id: Optional[uuid.UUID]
    posted_at: Optional[datetime]
    posted_by: Optional[uuid.UUID]
    reversed_by_id: Optional[uuid.UUID]
    total_debit: Decimal
    total_credit: Decimal
    lines: list[JournalEntryLineRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JournalEntryPost(BaseModel):
    """Request body for posting a draft entry."""
    pass


class JournalEntryReverse(BaseModel):
    """Request body for reversing a posted entry."""
    description: Optional[str] = Field(
        default=None, max_length=500,
        description="Override description for the reversal entry"
    )


# ── Account Balance ──────────────────────────────────────────────────────

class AccountBalanceRead(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    period_id: uuid.UUID
    debit_total: Decimal
    credit_total: Decimal
    balance: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Financial Statements ─────────────────────────────────────────────────

class TrialBalanceRow(BaseModel):
    account_id: uuid.UUID
    account_code: str
    account_name: str
    account_type: AccountType
    debit: Decimal
    credit: Decimal
    balance: Decimal


class TrialBalanceResponse(BaseModel):
    period_id: Optional[uuid.UUID]
    as_of_date: date
    rows: list[TrialBalanceRow]
    total_debit: Decimal
    total_credit: Decimal


class BalanceSheetSection(BaseModel):
    account_type: AccountType
    accounts: list[TrialBalanceRow]
    total: Decimal


class BalanceSheetResponse(BaseModel):
    as_of_date: date
    assets: BalanceSheetSection
    liabilities: BalanceSheetSection
    equity: BalanceSheetSection
    total_assets: Decimal
    total_liabilities_equity: Decimal


class IncomeStatementSection(BaseModel):
    account_type: AccountType
    accounts: list[TrialBalanceRow]
    total: Decimal


class IncomeStatementResponse(BaseModel):
    period_start: date
    period_end: date
    revenue: IncomeStatementSection
    expenses: IncomeStatementSection
    net_income: Decimal
