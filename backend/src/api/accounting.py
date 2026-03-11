"""
Accounting Engine API — Chart of Accounts, Journal Entries, GL, Financial Statements.

Endpoints:
- /gl/accounts          — Chart of Accounts CRUD
- /gl/periods           — Fiscal Period management
- /gl/journal-entries   — Journal Entry CRUD + post + reverse
- /gl/trial-balance     — Trial Balance report
- /gl/balance-sheet     — Balance Sheet report
- /gl/income-statement  — Income Statement (EERR)
- /gl/seed-coa          — Seed default Chart of Accounts for org
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.models.accounting import (
    AccountType,
    JournalEntrySource,
    JournalEntryStatus,
)
from src.schemas.accounting import (
    AccountCreate,
    AccountRead,
    AccountUpdate,
    BalanceSheetResponse,
    FiscalPeriodCreate,
    FiscalPeriodRead,
    FiscalPeriodUpdate,
    IncomeStatementResponse,
    JournalEntryCreate,
    JournalEntryRead,
    JournalEntryPost,
    JournalEntryReverse,
    TrialBalanceResponse,
)
from src.services.accounting_service import AccountingService

router = APIRouter(prefix="/gl", tags=["accounting"])

# ── Backward-compatibility aliases for COA seed data ─────────────────
CORE_COA = AccountingService.CORE_COA
VERTICAL_COA = AccountingService.VERTICAL_COA
get_full_coa = AccountingService.get_full_coa


def _svc(db: AsyncSession, user: User) -> AccountingService:
    return AccountingService(db, user.organization_id, user.id)


# ══════════════════════════════════════════════════════════════════════
# CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════


@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(
    account_type: AccountType | None = None,
    active_only: bool = True,
    page: int = Query(1, ge=1),
    size: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).list_accounts(
        account_type=account_type, active_only=active_only, page=page, size=size
    )


@router.get("/accounts/{account_id}", response_model=AccountRead)
async def get_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).get_account(account_id)


@router.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
async def create_account(
    data: AccountCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).create_account(data)


@router.put("/accounts/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: uuid.UUID,
    data: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).update_account(account_id, data)


# ══════════════════════════════════════════════════════════════════════
# FISCAL PERIODS
# ══════════════════════════════════════════════════════════════════════


@router.get("/periods", response_model=list[FiscalPeriodRead])
async def list_periods(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).list_periods()


@router.post("/periods", response_model=FiscalPeriodRead, status_code=status.HTTP_201_CREATED)
async def create_period(
    data: FiscalPeriodCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).create_period(data)


@router.put("/periods/{period_id}", response_model=FiscalPeriodRead)
async def update_period(
    period_id: uuid.UUID,
    data: FiscalPeriodUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).update_period(period_id, data)


# ══════════════════════════════════════════════════════════════════════
# JOURNAL ENTRIES
# ══════════════════════════════════════════════════════════════════════


@router.get("/journal-entries", response_model=list[JournalEntryRead])
async def list_journal_entries(
    status_filter: JournalEntryStatus | None = None,
    source_filter: JournalEntrySource | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).list_journal_entries(
        status_filter=status_filter,
        source_filter=source_filter,
        date_from=date_from,
        date_to=date_to,
        page=page,
        size=size,
    )


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryRead)
async def get_journal_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).get_journal_entry(entry_id)


@router.post(
    "/journal-entries",
    response_model=JournalEntryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_journal_entry(
    data: JournalEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).create_journal_entry(data)


@router.post("/journal-entries/{entry_id}/post", response_model=JournalEntryRead)
async def post_journal_entry(
    entry_id: uuid.UUID,
    _body: JournalEntryPost = JournalEntryPost(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Post a draft journal entry -- makes it permanent and updates balances."""
    return await _svc(db, user).post_journal_entry(entry_id)


@router.post("/journal-entries/{entry_id}/reverse", response_model=JournalEntryRead)
async def reverse_journal_entry(
    entry_id: uuid.UUID,
    body: JournalEntryReverse = JournalEntryReverse(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reverse a posted entry by creating a mirror entry with flipped debits/credits."""
    return await _svc(db, user).reverse_journal_entry(entry_id, body.description)


# ══════════════════════════════════════════════════════════════════════
# FINANCIAL STATEMENTS
# ══════════════════════════════════════════════════════════════════════


@router.get("/trial-balance", response_model=TrialBalanceResponse)
async def get_trial_balance(
    period_id: uuid.UUID | None = None,
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trial balance -- sum of all posted debits/credits per account."""
    return await _svc(db, user).get_trial_balance(
        period_id=period_id, as_of_date=as_of_date
    )


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
async def get_balance_sheet(
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Balance Sheet -- Assets = Liabilities + Equity."""
    return await _svc(db, user).get_balance_sheet(as_of_date=as_of_date)


@router.get("/income-statement", response_model=IncomeStatementResponse)
async def get_income_statement(
    period_start: date | None = None,
    period_end: date | None = None,
    period_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Income Statement (EERR) -- Revenue - Expenses = Net Income."""
    return await _svc(db, user).get_income_statement(
        period_start=period_start, period_end=period_end, period_id=period_id
    )


# ══════════════════════════════════════════════════════════════════════
# SEED DEFAULT CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════


@router.post("/seed-coa", response_model=list[AccountRead], status_code=status.HTTP_201_CREATED)
async def seed_chart_of_accounts(
    vertical: str = Query(default="egglogu", description="Vertical to seed accounts for"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Seed the Chart of Accounts for the organization.
    Core accounts + vertical-specific accounts. Skips existing codes."""
    return await _svc(db, user).seed_coa(vertical)
