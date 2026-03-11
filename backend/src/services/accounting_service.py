"""Accounting / GL business logic.

Extracted from src/api/accounting.py to keep routes thin.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

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


class AccountingService:
    """Stateless accounting service — GL posting, numbering, COA seeding."""

    # ── Sequential entry numbering ──────────────────────────────────

    @staticmethod
    async def next_entry_number(db: AsyncSession, org_id: uuid.UUID) -> str:
        """Generate sequential entry number: JE-000001, JE-000002, ..."""
        result = await db.execute(
            select(func.count(JournalEntry.id)).where(
                JournalEntry.organization_id == org_id
            )
        )
        count = result.scalar() or 0
        return f"JE-{count + 1:06d}"

    # ── Materialized balance updates ────────────────────────────────

    @staticmethod
    async def update_account_balances(
        db: AsyncSession, entry: JournalEntry, org_id: uuid.UUID
    ) -> None:
        """Update materialized AccountBalance rows when an entry is posted."""
        if not entry.period_id:
            return

        for line in entry.lines:
            result = await db.execute(
                select(AccountBalance).where(
                    AccountBalance.organization_id == org_id,
                    AccountBalance.account_id == line.account_id,
                    AccountBalance.period_id == entry.period_id,
                )
            )
            balance = result.scalar_one_or_none()

            if not balance:
                balance = AccountBalance(
                    organization_id=org_id,
                    account_id=line.account_id,
                    period_id=entry.period_id,
                    debit_total=Decimal("0.00"),
                    credit_total=Decimal("0.00"),
                    balance=Decimal("0.00"),
                )
                db.add(balance)

            balance.debit_total += line.debit
            balance.credit_total += line.credit

            # Get normal balance side to compute signed balance
            acct_result = await db.execute(
                select(Account.normal_balance).where(Account.id == line.account_id)
            )
            normal = acct_result.scalar_one()
            if normal == NormalBalance.DEBIT:
                balance.balance = balance.debit_total - balance.credit_total
            else:
                balance.balance = balance.credit_total - balance.debit_total

    # ── Journal entry posting ───────────────────────────────────────

    @staticmethod
    async def post_entry(
        db: AsyncSession, entry: JournalEntry, user_id: uuid.UUID, org_id: uuid.UUID
    ) -> JournalEntry:
        """Post a draft journal entry — validates period, updates balances."""
        from fastapi import HTTPException

        if entry.status != JournalEntryStatus.DRAFT:
            raise HTTPException(
                status_code=400, detail="Only draft entries can be posted"
            )

        # Validate period is open
        if entry.period_id:
            period_result = await db.execute(
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
        entry.posted_by = user_id

        await AccountingService.update_account_balances(db, entry, org_id)
        await db.flush()
        await invalidate_prefix(f"gl:{org_id}")
        return entry

    # ── Journal entry reversal ──────────────────────────────────────

    @staticmethod
    async def reverse_entry(
        db: AsyncSession,
        original: JournalEntry,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        description: str | None = None,
    ) -> JournalEntry:
        """Reverse a posted entry by creating a mirror entry with flipped debits/credits."""
        from fastapi import HTTPException

        if original.status != JournalEntryStatus.POSTED:
            raise HTTPException(
                status_code=400, detail="Only posted entries can be reversed"
            )

        rev_number = await AccountingService.next_entry_number(db, org_id)
        desc = description or f"Reversal of {original.entry_number}"

        reversal = JournalEntry(
            organization_id=org_id,
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
            posted_by=user_id,
        )
        db.add(reversal)
        await db.flush()

        for orig_line in original.lines:
            rev_line = JournalEntryLine(
                organization_id=org_id,
                journal_entry_id=reversal.id,
                account_id=orig_line.account_id,
                description=f"Rev: {orig_line.description or ''}",
                debit=orig_line.credit,
                credit=orig_line.debit,
                cost_center_id=orig_line.cost_center_id,
            )
            db.add(rev_line)

        original.status = JournalEntryStatus.REVERSED
        original.reversed_by_id = reversal.id

        await db.flush()
        # Re-load reversal with lines for balance update
        rev_result = await db.execute(
            select(JournalEntry)
            .options(selectinload(JournalEntry.lines))
            .where(JournalEntry.id == reversal.id)
        )
        reversal = rev_result.scalar_one()
        await AccountingService.update_account_balances(db, reversal, org_id)

        await db.flush()
        await invalidate_prefix(f"gl:{org_id}")
        return reversal

    # ── Chart of Accounts seed data ─────────────────────────────────

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

    @staticmethod
    async def seed_coa(
        db: AsyncSession, org_id: uuid.UUID, vertical: str = "egglogu"
    ) -> list[Account]:
        """Seed the Chart of Accounts for an org. Skips existing codes."""
        full_coa = AccountingService.get_full_coa(vertical)

        existing = await db.execute(
            select(Account.code).where(Account.organization_id == org_id)
        )
        existing_codes = {r for r in existing.scalars().all()}

        created = []
        for code, name, acct_type, sub_type, normal in full_coa:
            if code in existing_codes:
                continue
            account = Account(
                organization_id=org_id,
                code=code,
                name=name,
                account_type=acct_type,
                sub_type=sub_type,
                normal_balance=normal,
                is_system=True,
                is_active=True,
            )
            db.add(account)
            created.append(account)

        await db.flush()
        await invalidate_prefix(f"gl:{org_id}")
        return created
