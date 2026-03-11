"""Finance business logic — Income, Expenses, Receivables.

Inherits BaseService for tenant-scoped CRUD.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.cache import invalidate_prefix
from src.models.finance import Expense, Income, Receivable
from src.services.base import BaseService


class FinanceService(BaseService):
    """Tenant-scoped finance operations."""

    # ── Income ────────────────────────────────────────────────────────

    async def list_income(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Income, page=page, size=size)

    async def get_income(self, item_id: uuid.UUID):
        return await self._get(Income, item_id, error_msg="Income not found")

    async def create_income(self, data) -> Income:
        item = await self._create(Income, data)
        await invalidate_prefix(f"economics:{self.org_id}")
        return item

    async def update_income(self, item_id: uuid.UUID, data) -> Income:
        item = await self._update(Income, item_id, data, error_msg="Income not found")
        await invalidate_prefix(f"economics:{self.org_id}")
        return item

    async def delete_income(self, item_id: uuid.UUID) -> None:
        await self._delete(Income, item_id, error_msg="Income not found")
        await invalidate_prefix(f"economics:{self.org_id}")

    # ── Expenses ──────────────────────────────────────────────────────

    async def list_expenses(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Expense, page=page, size=size)

    async def get_expense(self, item_id: uuid.UUID):
        return await self._get(Expense, item_id, error_msg="Expense not found")

    async def create_expense(self, data) -> Expense:
        item = await self._create(Expense, data)
        await invalidate_prefix(f"economics:{self.org_id}")
        return item

    async def update_expense(self, item_id: uuid.UUID, data) -> Expense:
        item = await self._update(Expense, item_id, data, error_msg="Expense not found")
        await invalidate_prefix(f"economics:{self.org_id}")
        return item

    async def delete_expense(self, item_id: uuid.UUID) -> None:
        await self._delete(Expense, item_id, error_msg="Expense not found")
        await invalidate_prefix(f"economics:{self.org_id}")

    # ── Receivables ───────────────────────────────────────────────────

    async def list_receivables(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Receivable, page=page, size=size)

    async def get_receivable(self, item_id: uuid.UUID):
        return await self._get(Receivable, item_id, error_msg="Receivable not found")

    async def create_receivable(self, data) -> Receivable:
        return await self._create(Receivable, data)

    async def update_receivable(self, item_id: uuid.UUID, data) -> Receivable:
        return await self._update(
            Receivable, item_id, data, error_msg="Receivable not found"
        )

    async def delete_receivable(self, item_id: uuid.UUID) -> None:
        await self._delete(Receivable, item_id, error_msg="Receivable not found")
