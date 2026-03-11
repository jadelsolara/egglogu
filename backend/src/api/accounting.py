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
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import get_current_user
from src.core.cache import invalidate_prefix
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.accounting import (
    Account,
    AccountBalance,
    AccountType,
    AccountSubType,
    FiscalPeriod,
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
    NormalBalance,
    PeriodStatus,
)
from src.schemas.accounting import (
    AccountCreate,
    AccountRead,
    AccountUpdate,
    AccountBalanceRead,
    BalanceSheetResponse,
    BalanceSheetSection,
    FiscalPeriodCreate,
    FiscalPeriodRead,
    FiscalPeriodUpdate,
    IncomeStatementResponse,
    IncomeStatementSection,
    JournalEntryCreate,
    JournalEntryRead,
    JournalEntryPost,
    JournalEntryReverse,
    TrialBalanceResponse,
    TrialBalanceRow,
)

from src.services.accounting_service import AccountingService

router = APIRouter(prefix="/gl", tags=["accounting"])

# ── Helpers (delegated to AccountingService) ─────────────────────────────

_next_entry_number = AccountingService.next_entry_number
_update_account_balances = AccountingService.update_account_balances


# ══════════════════════════════════════════════════════════════════════════
# CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(
    account_type: AccountType | None = None,
    active_only: bool = True,
    page: int = Query(1, ge=1),
    size: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Account).where(Account.organization_id == user.organization_id)
    if account_type:
        stmt = stmt.where(Account.account_type == account_type)
    if active_only:
        stmt = stmt.where(Account.is_active.is_(True))
    stmt = stmt.order_by(Account.code).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/accounts/{account_id}", response_model=AccountRead)
async def get_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Account not found")
    return item


@router.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
async def create_account(
    data: AccountCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Account(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    await invalidate_prefix(f"gl:{user.organization_id}")
    return item


@router.put("/accounts/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: uuid.UUID,
    data: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Account not found")
    if item.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system accounts")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    await invalidate_prefix(f"gl:{user.organization_id}")
    return item


# ══════════════════════════════════════════════════════════════════════════
# FISCAL PERIODS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/periods", response_model=list[FiscalPeriodRead])
async def list_periods(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(FiscalPeriod)
        .where(FiscalPeriod.organization_id == user.organization_id)
        .order_by(FiscalPeriod.start_date.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/periods", response_model=FiscalPeriodRead, status_code=status.HTTP_201_CREATED)
async def create_period(
    data: FiscalPeriodCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = FiscalPeriod(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/periods/{period_id}", response_model=FiscalPeriodRead)
async def update_period(
    period_id: uuid.UUID,
    data: FiscalPeriodUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FiscalPeriod).where(
            FiscalPeriod.id == period_id,
            FiscalPeriod.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Fiscal period not found")
    if item.status == PeriodStatus.LOCKED:
        raise HTTPException(status_code=403, detail="Cannot modify locked periods")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)

    # If closing, record who and when
    if data.status in (PeriodStatus.CLOSED, PeriodStatus.LOCKED):
        item.closed_by = user.id
        item.closed_at = datetime.utcnow()

    await db.flush()
    return item


# ══════════════════════════════════════════════════════════════════════════
# JOURNAL ENTRIES
# ══════════════════════════════════════════════════════════════════════════

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
    stmt = (
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.organization_id == user.organization_id)
    )
    if status_filter:
        stmt = stmt.where(JournalEntry.status == status_filter)
    if source_filter:
        stmt = stmt.where(JournalEntry.source == source_filter)
    if date_from:
        stmt = stmt.where(JournalEntry.date >= date_from)
    if date_to:
        stmt = stmt.where(JournalEntry.date <= date_to)
    stmt = stmt.order_by(JournalEntry.date.desc(), JournalEntry.entry_number.desc())
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.get("/journal-entries/{entry_id}", response_model=JournalEntryRead)
async def get_journal_entry(
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.id == entry_id,
            JournalEntry.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Journal entry not found")
    return item


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
    entry_number = await _next_entry_number(db, user.organization_id)
    total_debit = sum(l.debit for l in data.lines)
    total_credit = sum(l.credit for l in data.lines)

    entry = JournalEntry(
        organization_id=user.organization_id,
        entry_number=entry_number,
        date=data.date,
        description=data.description,
        memo=data.memo,
        source=data.source,
        source_id=data.source_id,
        period_id=data.period_id,
        total_debit=total_debit,
        total_credit=total_credit,
        status=JournalEntryStatus.DRAFT,
    )
    db.add(entry)
    await db.flush()  # get entry.id

    for line_data in data.lines:
        line = JournalEntryLine(
            organization_id=user.organization_id,
            journal_entry_id=entry.id,
            account_id=line_data.account_id,
            description=line_data.description,
            debit=line_data.debit,
            credit=line_data.credit,
            cost_center_id=line_data.cost_center_id,
        )
        db.add(line)

    await db.flush()
    await invalidate_prefix(f"gl:{user.organization_id}")

    # Re-fetch with lines
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == entry.id)
    )
    return result.scalar_one()


@router.post("/journal-entries/{entry_id}/post", response_model=JournalEntryRead)
async def post_journal_entry(
    entry_id: uuid.UUID,
    _body: JournalEntryPost = JournalEntryPost(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Post a draft journal entry — makes it permanent and updates balances."""
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.id == entry_id,
            JournalEntry.organization_id == user.organization_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise NotFoundError("Journal entry not found")

    return await AccountingService.post_entry(
        db, entry, user.id, user.organization_id
    )


@router.post("/journal-entries/{entry_id}/reverse", response_model=JournalEntryRead)
async def reverse_journal_entry(
    entry_id: uuid.UUID,
    body: JournalEntryReverse = JournalEntryReverse(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reverse a posted entry by creating a mirror entry with flipped debits/credits."""
    result = await db.execute(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(
            JournalEntry.id == entry_id,
            JournalEntry.organization_id == user.organization_id,
        )
    )
    original = result.scalar_one_or_none()
    if not original:
        raise NotFoundError("Journal entry not found")

    return await AccountingService.reverse_entry(
        db, original, user.id, user.organization_id, body.description
    )


# ══════════════════════════════════════════════════════════════════════════
# FINANCIAL STATEMENTS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/trial-balance", response_model=TrialBalanceResponse)
async def get_trial_balance(
    period_id: uuid.UUID | None = None,
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trial balance — sum of all posted debits/credits per account."""
    org_id = user.organization_id
    report_date = as_of_date or date.today()

    # Build query from journal entry lines (posted entries only)
    stmt = (
        select(
            JournalEntryLine.account_id,
            Account.code,
            Account.name,
            Account.account_type,
            Account.normal_balance,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(Account, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.organization_id == org_id,
            JournalEntry.status == JournalEntryStatus.POSTED,
            JournalEntry.date <= report_date,
        )
        .group_by(
            JournalEntryLine.account_id,
            Account.code,
            Account.name,
            Account.account_type,
            Account.normal_balance,
        )
        .order_by(Account.code)
    )

    if period_id:
        stmt = stmt.where(JournalEntry.period_id == period_id)

    result = await db.execute(stmt)
    rows_raw = result.all()

    rows = []
    grand_debit = Decimal("0.00")
    grand_credit = Decimal("0.00")

    for r in rows_raw:
        debit = Decimal(str(r.total_debit))
        credit = Decimal(str(r.total_credit))
        if r.normal_balance == NormalBalance.DEBIT:
            balance = debit - credit
        else:
            balance = credit - debit

        rows.append(TrialBalanceRow(
            account_id=r.account_id,
            account_code=r.code,
            account_name=r.name,
            account_type=r.account_type,
            debit=debit,
            credit=credit,
            balance=balance,
        ))
        grand_debit += debit
        grand_credit += credit

    return TrialBalanceResponse(
        period_id=period_id,
        as_of_date=report_date,
        rows=rows,
        total_debit=grand_debit,
        total_credit=grand_credit,
    )


@router.get("/balance-sheet", response_model=BalanceSheetResponse)
async def get_balance_sheet(
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Balance Sheet — Assets = Liabilities + Equity."""
    report_date = as_of_date or date.today()
    org_id = user.organization_id

    # Get all posted lines up to as_of_date for BS accounts
    stmt = (
        select(
            JournalEntryLine.account_id,
            Account.code,
            Account.name,
            Account.account_type,
            Account.normal_balance,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(Account, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.organization_id == org_id,
            JournalEntry.status == JournalEntryStatus.POSTED,
            JournalEntry.date <= report_date,
            Account.account_type.in_([
                AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY
            ]),
        )
        .group_by(
            JournalEntryLine.account_id,
            Account.code, Account.name,
            Account.account_type, Account.normal_balance,
        )
        .order_by(Account.code)
    )
    result = await db.execute(stmt)

    sections: dict[AccountType, list[TrialBalanceRow]] = {
        AccountType.ASSET: [],
        AccountType.LIABILITY: [],
        AccountType.EQUITY: [],
    }

    for r in result.all():
        debit = Decimal(str(r.total_debit))
        credit = Decimal(str(r.total_credit))
        balance = debit - credit if r.normal_balance == NormalBalance.DEBIT else credit - debit

        sections[r.account_type].append(TrialBalanceRow(
            account_id=r.account_id,
            account_code=r.code,
            account_name=r.name,
            account_type=r.account_type,
            debit=debit,
            credit=credit,
            balance=balance,
        ))

    # Add retained earnings (net income) to equity
    # Net income = Revenue credits - Expense debits (from income statement accounts)
    net_income_stmt = (
        select(
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("rev_credit"),
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("rev_debit"),
        )
        .join(Account, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.organization_id == org_id,
            JournalEntry.status == JournalEntryStatus.POSTED,
            JournalEntry.date <= report_date,
            Account.account_type.in_([AccountType.REVENUE, AccountType.EXPENSE]),
        )
    )
    ni_result = await db.execute(net_income_stmt)
    ni_row = ni_result.one()
    net_income = Decimal(str(ni_row.rev_credit)) - Decimal(str(ni_row.rev_debit))

    if net_income != 0:
        sections[AccountType.EQUITY].append(TrialBalanceRow(
            account_id=uuid.UUID(int=0),  # synthetic
            account_code="3999",
            account_name="Retained Earnings (Current Period)",
            account_type=AccountType.EQUITY,
            debit=Decimal("0.00"),
            credit=net_income if net_income > 0 else Decimal("0.00"),
            balance=net_income,
        ))

    total_assets = sum(r.balance for r in sections[AccountType.ASSET])
    total_liabilities = sum(r.balance for r in sections[AccountType.LIABILITY])
    total_equity = sum(r.balance for r in sections[AccountType.EQUITY])

    return BalanceSheetResponse(
        as_of_date=report_date,
        assets=BalanceSheetSection(
            account_type=AccountType.ASSET,
            accounts=sections[AccountType.ASSET],
            total=total_assets,
        ),
        liabilities=BalanceSheetSection(
            account_type=AccountType.LIABILITY,
            accounts=sections[AccountType.LIABILITY],
            total=total_liabilities,
        ),
        equity=BalanceSheetSection(
            account_type=AccountType.EQUITY,
            accounts=sections[AccountType.EQUITY],
            total=total_equity,
        ),
        total_assets=total_assets,
        total_liabilities_equity=total_liabilities + total_equity,
    )


@router.get("/income-statement", response_model=IncomeStatementResponse)
async def get_income_statement(
    period_start: date | None = None,
    period_end: date | None = None,
    period_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Income Statement (EERR) — Revenue - Expenses = Net Income."""
    org_id = user.organization_id

    # Determine date range
    if period_id:
        p_result = await db.execute(
            select(FiscalPeriod).where(FiscalPeriod.id == period_id)
        )
        period = p_result.scalar_one_or_none()
        if not period:
            raise NotFoundError("Fiscal period not found")
        start = period.start_date
        end = period.end_date
    else:
        end = period_end or date.today()
        start = period_start or date(end.year, end.month, 1)

    stmt = (
        select(
            JournalEntryLine.account_id,
            Account.code,
            Account.name,
            Account.account_type,
            Account.normal_balance,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("total_credit"),
        )
        .join(Account, JournalEntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
        .where(
            JournalEntry.organization_id == org_id,
            JournalEntry.status == JournalEntryStatus.POSTED,
            JournalEntry.date >= start,
            JournalEntry.date <= end,
            Account.account_type.in_([AccountType.REVENUE, AccountType.EXPENSE]),
        )
        .group_by(
            JournalEntryLine.account_id,
            Account.code, Account.name,
            Account.account_type, Account.normal_balance,
        )
        .order_by(Account.code)
    )
    result = await db.execute(stmt)

    revenue_rows: list[TrialBalanceRow] = []
    expense_rows: list[TrialBalanceRow] = []

    for r in result.all():
        debit = Decimal(str(r.total_debit))
        credit = Decimal(str(r.total_credit))
        balance = debit - credit if r.normal_balance == NormalBalance.DEBIT else credit - debit

        row = TrialBalanceRow(
            account_id=r.account_id,
            account_code=r.code,
            account_name=r.name,
            account_type=r.account_type,
            debit=debit,
            credit=credit,
            balance=balance,
        )
        if r.account_type == AccountType.REVENUE:
            revenue_rows.append(row)
        else:
            expense_rows.append(row)

    total_revenue = sum(r.balance for r in revenue_rows)
    total_expenses = sum(r.balance for r in expense_rows)

    return IncomeStatementResponse(
        period_start=start,
        period_end=end,
        revenue=IncomeStatementSection(
            account_type=AccountType.REVENUE,
            accounts=revenue_rows,
            total=total_revenue,
        ),
        expenses=IncomeStatementSection(
            account_type=AccountType.EXPENSE,
            accounts=expense_rows,
            total=total_expenses,
        ),
        net_income=total_revenue - total_expenses,
    )


# ══════════════════════════════════════════════════════════════════════════
# SEED DEFAULT CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════════

# ── COA seed data (canonical source: AccountingService) ──────────────────
# Kept as aliases for backward-compatibility with imports/tests.
CORE_COA = AccountingService.CORE_COA
VERTICAL_COA = AccountingService.VERTICAL_COA
get_full_coa = AccountingService.get_full_coa


@router.post("/seed-coa", response_model=list[AccountRead], status_code=status.HTTP_201_CREATED)
async def seed_chart_of_accounts(
    vertical: str = Query(default="egglogu", description="Vertical to seed accounts for"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Seed the Chart of Accounts for the organization.
    Core accounts + vertical-specific accounts. Skips existing codes."""
    return await AccountingService.seed_coa(db, user.organization_id, vertical)
