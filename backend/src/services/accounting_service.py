"""Accounting / GL business logic.

Inherits BaseService for tenant-scoped CRUD.
Extracted from src/api/accounting.py to keep routes thin.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.cache import invalidate_prefix
from src.models.accounting import (
    Account,
    AccountBalance,
    AccountSubType,
    AccountType,
    FiscalPeriod,
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
    NormalBalance,
    PeriodStatus,
)
from src.schemas.accounting import (
    BalanceSheetResponse,
    BalanceSheetSection,
    IncomeStatementResponse,
    IncomeStatementSection,
    TrialBalanceResponse,
    TrialBalanceRow,
)
from src.services.base import BaseService


class AccountingService(BaseService):
    """Tenant-scoped accounting / GL operations."""

    # ══════════════════════════════════════════════════════════════════
    # CHART OF ACCOUNTS
    # ══════════════════════════════════════════════════════════════════

    async def list_accounts(
        self,
        *,
        account_type: AccountType | None = None,
        active_only: bool = True,
        page: int = 1,
        size: int = 200,
    ) -> list:
        stmt = self._scoped(Account)
        if account_type:
            stmt = stmt.where(Account.account_type == account_type)
        if active_only:
            stmt = stmt.where(Account.is_active.is_(True))
        stmt = stmt.order_by(Account.code).offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_account(self, account_id: uuid.UUID) -> Account:
        return await self._get(Account, account_id, error_msg="Account not found")

    async def create_account(self, data) -> Account:
        item = await self._create(Account, data)
        await invalidate_prefix(f"gl:{self.org_id}")
        return item

    async def update_account(self, account_id: uuid.UUID, data) -> Account:
        item = await self._get(Account, account_id, error_msg="Account not found")
        if item.is_system:
            raise HTTPException(status_code=403, detail="Cannot modify system accounts")
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        await self.db.flush()
        await invalidate_prefix(f"gl:{self.org_id}")
        return item

    # ══════════════════════════════════════════════════════════════════
    # FISCAL PERIODS
    # ══════════════════════════════════════════════════════════════════

    async def list_periods(self) -> list:
        stmt = (
            self._scoped(FiscalPeriod)
            .order_by(FiscalPeriod.start_date.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_period(self, data) -> FiscalPeriod:
        return await self._create(FiscalPeriod, data)

    async def update_period(self, period_id: uuid.UUID, data) -> FiscalPeriod:
        item = await self._get(
            FiscalPeriod, period_id, error_msg="Fiscal period not found"
        )
        if item.status == PeriodStatus.LOCKED:
            raise HTTPException(status_code=403, detail="Cannot modify locked periods")

        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)

        # If closing, record who and when
        if data.status in (PeriodStatus.CLOSED, PeriodStatus.LOCKED):
            item.closed_by = self.user_id
            item.closed_at = datetime.utcnow()

        await self.db.flush()
        return item

    # ══════════════════════════════════════════════════════════════════
    # JOURNAL ENTRIES
    # ══════════════════════════════════════════════════════════════════

    async def list_journal_entries(
        self,
        *,
        status_filter: JournalEntryStatus | None = None,
        source_filter: JournalEntrySource | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = (
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.organization_id == self.org_id)
        )
        if status_filter:
            stmt = stmt.where(JournalEntry.status == status_filter)
        if source_filter:
            stmt = stmt.where(JournalEntry.source == source_filter)
        if date_from:
            stmt = stmt.where(JournalEntry.date >= date_from)
        if date_to:
            stmt = stmt.where(JournalEntry.date <= date_to)
        stmt = stmt.order_by(
            JournalEntry.date.desc(), JournalEntry.entry_number.desc()
        )
        stmt = stmt.offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_journal_entry(self, entry_id: uuid.UUID) -> JournalEntry:
        result = await self.db.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(
                JournalEntry.id == entry_id,
                JournalEntry.organization_id == self.org_id,
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            from src.core.exceptions import NotFoundError

            raise NotFoundError("Journal entry not found")
        return item

    async def create_journal_entry(self, data) -> JournalEntry:
        entry_number = await self._next_entry_number()
        total_debit = sum(l.debit for l in data.lines)
        total_credit = sum(l.credit for l in data.lines)

        entry = JournalEntry(
            organization_id=self.org_id,
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
        self.db.add(entry)
        await self.db.flush()  # get entry.id

        for line_data in data.lines:
            line = JournalEntryLine(
                organization_id=self.org_id,
                journal_entry_id=entry.id,
                account_id=line_data.account_id,
                description=line_data.description,
                debit=line_data.debit,
                credit=line_data.credit,
                cost_center_id=line_data.cost_center_id,
            )
            self.db.add(line)

        await self.db.flush()
        await invalidate_prefix(f"gl:{self.org_id}")

        # Re-fetch with lines
        result = await self.db.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.id == entry.id)
        )
        return result.scalar_one()

    async def post_journal_entry(self, entry_id: uuid.UUID) -> JournalEntry:
        entry = await self.get_journal_entry(entry_id)
        return await self._post_entry(entry)

    async def reverse_journal_entry(
        self, entry_id: uuid.UUID, description: str | None = None
    ) -> JournalEntry:
        entry = await self.get_journal_entry(entry_id)
        return await self._reverse_entry(entry, description)

    # ══════════════════════════════════════════════════════════════════
    # FINANCIAL STATEMENTS
    # ══════════════════════════════════════════════════════════════════

    async def get_trial_balance(
        self,
        *,
        period_id: uuid.UUID | None = None,
        as_of_date: date | None = None,
    ) -> TrialBalanceResponse:
        report_date = as_of_date or date.today()

        stmt = (
            select(
                JournalEntryLine.account_id,
                Account.code,
                Account.name,
                Account.account_type,
                Account.normal_balance,
                func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
                func.coalesce(func.sum(JournalEntryLine.credit), 0).label(
                    "total_credit"
                ),
            )
            .join(Account, JournalEntryLine.account_id == Account.id)
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.organization_id == self.org_id,
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

        result = await self.db.execute(stmt)
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

            rows.append(
                TrialBalanceRow(
                    account_id=r.account_id,
                    account_code=r.code,
                    account_name=r.name,
                    account_type=r.account_type,
                    debit=debit,
                    credit=credit,
                    balance=balance,
                )
            )
            grand_debit += debit
            grand_credit += credit

        return TrialBalanceResponse(
            period_id=period_id,
            as_of_date=report_date,
            rows=rows,
            total_debit=grand_debit,
            total_credit=grand_credit,
        )

    async def get_balance_sheet(
        self, *, as_of_date: date | None = None
    ) -> BalanceSheetResponse:
        report_date = as_of_date or date.today()

        stmt = (
            select(
                JournalEntryLine.account_id,
                Account.code,
                Account.name,
                Account.account_type,
                Account.normal_balance,
                func.coalesce(func.sum(JournalEntryLine.debit), 0).label("total_debit"),
                func.coalesce(func.sum(JournalEntryLine.credit), 0).label(
                    "total_credit"
                ),
            )
            .join(Account, JournalEntryLine.account_id == Account.id)
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.organization_id == self.org_id,
                JournalEntry.status == JournalEntryStatus.POSTED,
                JournalEntry.date <= report_date,
                Account.account_type.in_(
                    [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY]
                ),
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
        result = await self.db.execute(stmt)

        sections: dict[AccountType, list[TrialBalanceRow]] = {
            AccountType.ASSET: [],
            AccountType.LIABILITY: [],
            AccountType.EQUITY: [],
        }

        for r in result.all():
            debit = Decimal(str(r.total_debit))
            credit = Decimal(str(r.total_credit))
            balance = (
                debit - credit
                if r.normal_balance == NormalBalance.DEBIT
                else credit - debit
            )

            sections[r.account_type].append(
                TrialBalanceRow(
                    account_id=r.account_id,
                    account_code=r.code,
                    account_name=r.name,
                    account_type=r.account_type,
                    debit=debit,
                    credit=credit,
                    balance=balance,
                )
            )

        # Net income = Revenue credits - Expense debits
        net_income_stmt = (
            select(
                func.coalesce(func.sum(JournalEntryLine.credit), 0).label("rev_credit"),
                func.coalesce(func.sum(JournalEntryLine.debit), 0).label("rev_debit"),
            )
            .join(Account, JournalEntryLine.account_id == Account.id)
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.organization_id == self.org_id,
                JournalEntry.status == JournalEntryStatus.POSTED,
                JournalEntry.date <= report_date,
                Account.account_type.in_(
                    [AccountType.REVENUE, AccountType.EXPENSE]
                ),
            )
        )
        ni_result = await self.db.execute(net_income_stmt)
        ni_row = ni_result.one()
        net_income = Decimal(str(ni_row.rev_credit)) - Decimal(str(ni_row.rev_debit))

        if net_income != 0:
            sections[AccountType.EQUITY].append(
                TrialBalanceRow(
                    account_id=uuid.UUID(int=0),
                    account_code="3999",
                    account_name="Retained Earnings (Current Period)",
                    account_type=AccountType.EQUITY,
                    debit=Decimal("0.00"),
                    credit=net_income if net_income > 0 else Decimal("0.00"),
                    balance=net_income,
                )
            )

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

    async def get_income_statement(
        self,
        *,
        period_start: date | None = None,
        period_end: date | None = None,
        period_id: uuid.UUID | None = None,
    ) -> IncomeStatementResponse:
        # Determine date range
        if period_id:
            from src.core.exceptions import NotFoundError

            p_result = await self.db.execute(
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
                func.coalesce(func.sum(JournalEntryLine.credit), 0).label(
                    "total_credit"
                ),
            )
            .join(Account, JournalEntryLine.account_id == Account.id)
            .join(JournalEntry, JournalEntryLine.journal_entry_id == JournalEntry.id)
            .where(
                JournalEntry.organization_id == self.org_id,
                JournalEntry.status == JournalEntryStatus.POSTED,
                JournalEntry.date >= start,
                JournalEntry.date <= end,
                Account.account_type.in_(
                    [AccountType.REVENUE, AccountType.EXPENSE]
                ),
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
        result = await self.db.execute(stmt)

        revenue_rows: list[TrialBalanceRow] = []
        expense_rows: list[TrialBalanceRow] = []

        for r in result.all():
            debit = Decimal(str(r.total_debit))
            credit = Decimal(str(r.total_credit))
            balance = (
                debit - credit
                if r.normal_balance == NormalBalance.DEBIT
                else credit - debit
            )

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

    # ══════════════════════════════════════════════════════════════════
    # SEED CHART OF ACCOUNTS
    # ══════════════════════════════════════════════════════════════════

    async def seed_coa(self, vertical: str = "egglogu") -> list[Account]:
        """Seed the Chart of Accounts for the org. Skips existing codes."""
        full_coa = self.get_full_coa(vertical)

        existing = await self.db.execute(
            select(Account.code).where(Account.organization_id == self.org_id)
        )
        existing_codes = {r for r in existing.scalars().all()}

        created = []
        for code, name, acct_type, sub_type, normal in full_coa:
            if code in existing_codes:
                continue
            account = Account(
                organization_id=self.org_id,
                code=code,
                name=name,
                account_type=acct_type,
                sub_type=sub_type,
                normal_balance=normal,
                is_system=True,
                is_active=True,
            )
            self.db.add(account)
            created.append(account)

        await self.db.flush()
        await invalidate_prefix(f"gl:{self.org_id}")
        return created

    # ══════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ══════════════════════════════════════════════════════════════════

    async def _next_entry_number(self) -> str:
        """Generate sequential entry number: JE-000001, JE-000002, ..."""
        result = await self.db.execute(
            select(func.count(JournalEntry.id)).where(
                JournalEntry.organization_id == self.org_id
            )
        )
        count = result.scalar() or 0
        return f"JE-{count + 1:06d}"

    async def _update_account_balances(self, entry: JournalEntry) -> None:
        """Update materialized AccountBalance rows when an entry is posted."""
        if not entry.period_id:
            return

        for line in entry.lines:
            result = await self.db.execute(
                select(AccountBalance).where(
                    AccountBalance.organization_id == self.org_id,
                    AccountBalance.account_id == line.account_id,
                    AccountBalance.period_id == entry.period_id,
                )
            )
            balance = result.scalar_one_or_none()

            if not balance:
                balance = AccountBalance(
                    organization_id=self.org_id,
                    account_id=line.account_id,
                    period_id=entry.period_id,
                    debit_total=Decimal("0.00"),
                    credit_total=Decimal("0.00"),
                    balance=Decimal("0.00"),
                )
                self.db.add(balance)

            balance.debit_total += line.debit
            balance.credit_total += line.credit

            acct_result = await self.db.execute(
                select(Account.normal_balance).where(Account.id == line.account_id)
            )
            normal = acct_result.scalar_one()
            if normal == NormalBalance.DEBIT:
                balance.balance = balance.debit_total - balance.credit_total
            else:
                balance.balance = balance.credit_total - balance.debit_total

    async def _post_entry(self, entry: JournalEntry) -> JournalEntry:
        """Post a draft journal entry — validates period, updates balances."""
        if entry.status != JournalEntryStatus.DRAFT:
            raise HTTPException(
                status_code=400, detail="Only draft entries can be posted"
            )

        if entry.period_id:
            period_result = await self.db.execute(
                select(FiscalPeriod).where(FiscalPeriod.id == entry.period_id)
            )
            period = period_result.scalar_one_or_none()
            if period and period.status != PeriodStatus.OPEN:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot post to {period.status.value} period",
                )

        entry.status = JournalEntryStatus.POSTED
        entry.posted_at = datetime.utcnow()
        entry.posted_by = self.user_id

        await self._update_account_balances(entry)
        await self.db.flush()
        await invalidate_prefix(f"gl:{self.org_id}")
        return entry

    async def _reverse_entry(
        self, original: JournalEntry, description: str | None = None
    ) -> JournalEntry:
        """Reverse a posted entry by creating a mirror entry."""
        if original.status != JournalEntryStatus.POSTED:
            raise HTTPException(
                status_code=400, detail="Only posted entries can be reversed"
            )

        rev_number = await self._next_entry_number()
        desc = description or f"Reversal of {original.entry_number}"

        reversal = JournalEntry(
            organization_id=self.org_id,
            entry_number=rev_number,
            date=date.today(),
            description=desc,
            memo=f"Auto-reversal of {original.entry_number}",
            source=original.source,
            source_id=original.source_id,
            period_id=original.period_id,
            total_debit=original.total_credit,
            total_credit=original.total_debit,
            status=JournalEntryStatus.POSTED,
            posted_at=datetime.utcnow(),
            posted_by=self.user_id,
        )
        self.db.add(reversal)
        await self.db.flush()

        for orig_line in original.lines:
            rev_line = JournalEntryLine(
                organization_id=self.org_id,
                journal_entry_id=reversal.id,
                account_id=orig_line.account_id,
                description=f"Rev: {orig_line.description or ''}",
                debit=orig_line.credit,
                credit=orig_line.debit,
                cost_center_id=orig_line.cost_center_id,
            )
            self.db.add(rev_line)

        original.status = JournalEntryStatus.REVERSED
        original.reversed_by_id = reversal.id

        await self.db.flush()
        # Re-load reversal with lines for balance update
        rev_result = await self.db.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.id == reversal.id)
        )
        reversal = rev_result.scalar_one()
        await self._update_account_balances(reversal)

        await self.db.flush()
        await invalidate_prefix(f"gl:{self.org_id}")
        return reversal

    # ══════════════════════════════════════════════════════════════════
    # COA SEED DATA (class-level constants)
    # ══════════════════════════════════════════════════════════════════

    CORE_COA = [
        ("1000", "Cash", AccountType.ASSET, AccountSubType.CASH, NormalBalance.DEBIT),
        ("1010", "Bank Account", AccountType.ASSET, AccountSubType.CASH, NormalBalance.DEBIT),
        ("1100", "Accounts Receivable", AccountType.ASSET, AccountSubType.ACCOUNTS_RECEIVABLE, NormalBalance.DEBIT),
        ("1200", "Product Inventory", AccountType.ASSET, AccountSubType.INVENTORY, NormalBalance.DEBIT),
        ("1210", "Feed & Supplies Inventory", AccountType.ASSET, AccountSubType.INVENTORY, NormalBalance.DEBIT),
        ("1220", "Packaging Materials", AccountType.ASSET, AccountSubType.INVENTORY, NormalBalance.DEBIT),
        ("1300", "Prepaid Expenses", AccountType.ASSET, AccountSubType.PREPAID, NormalBalance.DEBIT),
        ("1500", "Biological Assets (IAS 41)", AccountType.ASSET, AccountSubType.BIOLOGICAL_ASSET, NormalBalance.DEBIT),
        ("1600", "Buildings & Equipment", AccountType.ASSET, AccountSubType.FIXED_ASSET, NormalBalance.DEBIT),
        ("1610", "Vehicles", AccountType.ASSET, AccountSubType.FIXED_ASSET, NormalBalance.DEBIT),
        ("1650", "Accumulated Depreciation", AccountType.ASSET, AccountSubType.ACCUMULATED_DEPRECIATION, NormalBalance.CREDIT),
        ("2000", "Accounts Payable", AccountType.LIABILITY, AccountSubType.ACCOUNTS_PAYABLE, NormalBalance.CREDIT),
        ("2100", "Taxes Payable", AccountType.LIABILITY, AccountSubType.TAX_PAYABLE, NormalBalance.CREDIT),
        ("2200", "Short-term Loans", AccountType.LIABILITY, AccountSubType.CURRENT_LIABILITY, NormalBalance.CREDIT),
        ("2500", "Long-term Debt", AccountType.LIABILITY, AccountSubType.LONG_TERM_LIABILITY, NormalBalance.CREDIT),
        ("3000", "Owner's Capital", AccountType.EQUITY, AccountSubType.OWNERS_EQUITY, NormalBalance.CREDIT),
        ("3100", "Retained Earnings", AccountType.EQUITY, AccountSubType.RETAINED_EARNINGS, NormalBalance.CREDIT),
        ("4000", "Product Sales", AccountType.REVENUE, AccountSubType.SALES_REVENUE, NormalBalance.CREDIT),
        ("4900", "Other Revenue", AccountType.REVENUE, AccountSubType.OTHER_REVENUE, NormalBalance.CREDIT),
        ("5000", "Cost of Goods Sold", AccountType.EXPENSE, AccountSubType.COGS, NormalBalance.DEBIT),
        ("5100", "Cost of Goods Sold — Feed/Supplies", AccountType.EXPENSE, AccountSubType.COGS, NormalBalance.DEBIT),
        ("6000", "Feed & Nutrition", AccountType.EXPENSE, AccountSubType.FEED_EXPENSE, NormalBalance.DEBIT),
        ("6100", "Veterinary & Health", AccountType.EXPENSE, AccountSubType.HEALTH_EXPENSE, NormalBalance.DEBIT),
        ("6200", "Labor & Payroll", AccountType.EXPENSE, AccountSubType.LABOR_EXPENSE, NormalBalance.DEBIT),
        ("6300", "Utilities (Electric, Water, Gas)", AccountType.EXPENSE, AccountSubType.UTILITY_EXPENSE, NormalBalance.DEBIT),
        ("6400", "Depreciation Expense", AccountType.EXPENSE, AccountSubType.DEPRECIATION_EXPENSE, NormalBalance.DEBIT),
        ("6500", "Packaging & Supplies", AccountType.EXPENSE, AccountSubType.OPERATING_EXPENSE, NormalBalance.DEBIT),
        ("6600", "Transport & Delivery", AccountType.EXPENSE, AccountSubType.OPERATING_EXPENSE, NormalBalance.DEBIT),
        ("6700", "Insurance", AccountType.EXPENSE, AccountSubType.OPERATING_EXPENSE, NormalBalance.DEBIT),
        ("6800", "Maintenance & Repairs", AccountType.EXPENSE, AccountSubType.OPERATING_EXPENSE, NormalBalance.DEBIT),
        ("6900", "Other Operating Expenses", AccountType.EXPENSE, AccountSubType.OTHER_EXPENSE, NormalBalance.DEBIT),
    ]

    VERTICAL_COA: dict[str, list[tuple]] = {
        "egglogu": [
            ("4010", "Egg Sales — Table", AccountType.REVENUE, AccountSubType.SALES_REVENUE, NormalBalance.CREDIT),
            ("4020", "Spent Hen Sales", AccountType.REVENUE, AccountSubType.SALES_REVENUE, NormalBalance.CREDIT),
            ("4030", "Manure / Fertilizer Sales", AccountType.REVENUE, AccountSubType.SALES_REVENUE, NormalBalance.CREDIT),
            ("1201", "Egg Inventory — Graded", AccountType.ASSET, AccountSubType.INVENTORY, NormalBalance.DEBIT),
            ("5010", "COGS — Eggs", AccountType.EXPENSE, AccountSubType.COGS, NormalBalance.DEBIT),
        ],
    }

    @staticmethod
    def get_full_coa(vertical: str = "egglogu") -> list[tuple]:
        """Return CORE_COA + vertical-specific accounts."""
        return AccountingService.CORE_COA + AccountingService.VERTICAL_COA.get(vertical, [])
