"""
GL Posting Service — Auto-generates journal entries from business transactions.

Every Income, Expense, Inventory movement, and Feed purchase gets a corresponding
double-entry journal entry in the General Ledger. This is the bridge between
operational modules and the accounting engine.

Usage:
    from src.core.gl_posting import GLPostingService
    service = GLPostingService(db, org_id, user_id)
    await service.post_income(income)
    await service.post_expense(expense)
    await service.post_inventory_sale(stock_movement)
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.accounting import (
    Account,
    AccountBalance,
    FiscalPeriod,
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
    NormalBalance,
    PeriodStatus,
)
from sqlalchemy import func


class GLPostingService:
    """Service to create and post journal entries from business events."""

    def __init__(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
    ):
        self.db = db
        self.org_id = organization_id
        self.user_id = user_id

    async def _next_entry_number(self) -> str:
        result = await self.db.execute(
            select(func.count(JournalEntry.id)).where(
                JournalEntry.organization_id == self.org_id
            )
        )
        count = result.scalar() or 0
        return f"JE-{count + 1:06d}"

    async def _find_account_by_code(self, code: str) -> Optional[Account]:
        result = await self.db.execute(
            select(Account).where(
                Account.organization_id == self.org_id,
                Account.code == code,
                Account.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def _find_open_period(self, txn_date: date) -> Optional[uuid.UUID]:
        result = await self.db.execute(
            select(FiscalPeriod.id).where(
                FiscalPeriod.organization_id == self.org_id,
                FiscalPeriod.status == PeriodStatus.OPEN,
                FiscalPeriod.start_date <= txn_date,
                FiscalPeriod.end_date >= txn_date,
            )
        )
        return result.scalar_one_or_none()

    async def _create_and_post(
        self,
        txn_date: date,
        description: str,
        source: JournalEntrySource,
        source_id: uuid.UUID,
        lines: list[tuple[str, Decimal, Decimal]],  # (account_code, debit, credit)
    ) -> Optional[JournalEntry]:
        """Create a journal entry with given lines and post it immediately.

        Args:
            lines: list of (account_code, debit_amount, credit_amount)
        Returns:
            The posted JournalEntry, or None if accounts not found.
        """
        period_id = await self._find_open_period(txn_date)
        entry_number = await self._next_entry_number()

        total_debit = sum(d for _, d, _ in lines)
        total_credit = sum(c for _, _, c in lines)

        entry = JournalEntry(
            organization_id=self.org_id,
            entry_number=entry_number,
            date=txn_date,
            description=description,
            source=source,
            source_id=source_id,
            period_id=period_id,
            total_debit=total_debit,
            total_credit=total_credit,
            status=JournalEntryStatus.POSTED,
            posted_at=datetime.utcnow(),
            posted_by=self.user_id,
        )
        self.db.add(entry)
        await self.db.flush()

        for code, debit, credit in lines:
            account = await self._find_account_by_code(code)
            if not account:
                # Account not in CoA — skip this entry silently
                # (org hasn't seeded CoA yet)
                return None

            line = JournalEntryLine(
                organization_id=self.org_id,
                journal_entry_id=entry.id,
                account_id=account.id,
                debit=debit,
                credit=credit,
            )
            self.db.add(line)

            # Update materialized balances
            if period_id:
                await self._update_balance(account.id, period_id, debit, credit)

        await self.db.flush()
        return entry

    async def _update_balance(
        self,
        account_id: uuid.UUID,
        period_id: uuid.UUID,
        debit: Decimal,
        credit: Decimal,
    ):
        result = await self.db.execute(
            select(AccountBalance).where(
                AccountBalance.organization_id == self.org_id,
                AccountBalance.account_id == account_id,
                AccountBalance.period_id == period_id,
            )
        )
        balance = result.scalar_one_or_none()

        if not balance:
            balance = AccountBalance(
                organization_id=self.org_id,
                account_id=account_id,
                period_id=period_id,
                debit_total=Decimal("0.00"),
                credit_total=Decimal("0.00"),
                balance=Decimal("0.00"),
            )
            self.db.add(balance)

        balance.debit_total += debit
        balance.credit_total += credit

        # Get normal balance
        acct = await self.db.execute(
            select(Account.normal_balance).where(Account.id == account_id)
        )
        normal = acct.scalar_one()
        if normal == NormalBalance.DEBIT:
            balance.balance = balance.debit_total - balance.credit_total
        else:
            balance.balance = balance.credit_total - balance.debit_total

    # ══════════════════════════════════════════════════════════════════════
    # CORE BUSINESS EVENT HANDLERS (product-agnostic)
    # These work for any FarmLogU vertical (EGGlogU, PigLogu, CowLogu, etc.)
    # ══════════════════════════════════════════════════════════════════════

    async def post_income(
        self,
        income_id: uuid.UUID,
        txn_date: date,
        total: Decimal,
        description: str = "Product sale",
        payment_method: Optional[str] = None,
        revenue_account: str = "4000",
    ) -> Optional[JournalEntry]:
        """Income → DR Cash/AR, CR Revenue.

        Cash sale:  DR 1000 Cash, CR {revenue_account}
        Credit sale: DR 1100 AR, CR {revenue_account}

        Verticals override revenue_account for specific products:
        - EGGlogU: "4010" for egg sales, "4020" for spent hen sales
        - PigLogu: "4010" for pork sales
        - CowLogu: "4010" for milk, "4020" for beef
        """
        debit_code = "1100" if payment_method == "credit" else "1000"
        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=JournalEntrySource.INCOME,
            source_id=income_id,
            lines=[
                (debit_code, total, Decimal("0.00")),
                (revenue_account, Decimal("0.00"), total),
            ],
        )

    async def post_expense(
        self,
        expense_id: uuid.UUID,
        txn_date: date,
        amount: Decimal,
        category: str,
        description: str = "Operating expense",
        expense_account: Optional[str] = None,
    ) -> Optional[JournalEntry]:
        """Expense → DR Expense account, CR Cash/AP.

        If expense_account is given, uses it directly.
        Otherwise maps category → standard expense code.
        """
        if not expense_account:
            category_map = {
                "feed": "6000",
                "nutrition": "6000",
                "health": "6100",
                "veterinary": "6100",
                "medication": "6100",
                "labor": "6200",
                "payroll": "6200",
                "utilities": "6300",
                "electric": "6300",
                "water": "6300",
                "packaging": "6500",
                "transport": "6600",
                "delivery": "6600",
                "insurance": "6700",
                "maintenance": "6800",
                "repairs": "6800",
            }
            expense_account = category_map.get(category.lower(), "6900")

        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=JournalEntrySource.EXPENSE,
            source_id=expense_id,
            lines=[
                (expense_account, amount, Decimal("0.00")),
                ("1000", Decimal("0.00"), amount),  # CR Cash
            ],
        )

    async def post_feed_purchase(
        self,
        purchase_id: uuid.UUID,
        txn_date: date,
        amount: Decimal,
        description: str = "Feed/supplies purchase",
        inventory_account: str = "1210",
    ) -> Optional[JournalEntry]:
        """Feed/supplies purchase → DR Inventory, CR AP."""
        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=JournalEntrySource.FEED,
            source_id=purchase_id,
            lines=[
                (inventory_account, amount, Decimal("0.00")),
                ("2000", Decimal("0.00"), amount),   # CR Accounts Payable
            ],
        )

    async def post_inventory_sale(
        self,
        movement_id: uuid.UUID,
        txn_date: date,
        cost_amount: Decimal,
        description: str = "COGS — product sold",
        cogs_account: str = "5000",
        inventory_account: str = "1200",
    ) -> Optional[JournalEntry]:
        """Inventory out (sale) → DR COGS, CR Inventory.

        Verticals override accounts:
        - EGGlogU: cogs_account="5010", inventory_account="1201"
        """
        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=JournalEntrySource.INVENTORY,
            source_id=movement_id,
            lines=[
                (cogs_account, cost_amount, Decimal("0.00")),
                (inventory_account, Decimal("0.00"), cost_amount),
            ],
        )

    async def post_receivable_payment(
        self,
        receivable_id: uuid.UUID,
        txn_date: date,
        amount: Decimal,
        description: str = "Receivable payment received",
    ) -> Optional[JournalEntry]:
        """AR payment → DR Cash, CR Accounts Receivable."""
        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=JournalEntrySource.RECEIVABLE,
            source_id=receivable_id,
            lines=[
                ("1000", amount, Decimal("0.00")),
                ("1100", Decimal("0.00"), amount),
            ],
        )

    async def post_purchase_order(
        self,
        po_id: uuid.UUID,
        txn_date: date,
        amount: Decimal,
        description: str = "Purchase order",
        debit_account: str = "1220",
    ) -> Optional[JournalEntry]:
        """PO received → DR Inventory/Expense, CR AP.

        Verticals override debit_account based on what's being purchased.
        """
        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=JournalEntrySource.PURCHASE_ORDER,
            source_id=po_id,
            lines=[
                (debit_account, amount, Decimal("0.00")),
                ("2000", Decimal("0.00"), amount),
            ],
        )

    async def post_depreciation(
        self,
        asset_description: str,
        txn_date: date,
        amount: Decimal,
    ) -> Optional[JournalEntry]:
        """Monthly depreciation → DR Depreciation Expense, CR Accumulated Depreciation."""
        return await self._create_and_post(
            txn_date=txn_date,
            description=f"Depreciation: {asset_description}",
            source=JournalEntrySource.DEPRECIATION,
            source_id=uuid.uuid4(),
            lines=[
                ("6400", amount, Decimal("0.00")),
                ("1650", Decimal("0.00"), amount),
            ],
        )

    async def post_custom(
        self,
        txn_date: date,
        description: str,
        source: JournalEntrySource,
        source_id: uuid.UUID,
        lines: list[tuple[str, Decimal, Decimal]],
    ) -> Optional[JournalEntry]:
        """Generic posting — verticals use this for non-standard transactions."""
        return await self._create_and_post(
            txn_date=txn_date,
            description=description,
            source=source,
            source_id=source_id,
            lines=lines,
        )
