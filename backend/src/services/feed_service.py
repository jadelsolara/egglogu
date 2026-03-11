"""FeedService — Compras y consumo de alimento."""

import uuid

from src.core.cache import invalidate_prefix
from src.models.feed import FeedConsumption, FeedPurchase
from src.services.base import BaseService


class FeedService(BaseService):
    async def _invalidate(self) -> None:
        await invalidate_prefix(f"economics:{self.org_id}")

    # ── Compras ──────────────────────────────────────────────────────

    async def list_purchases(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(FeedPurchase, page=page, size=size)

    async def get_purchase(self, item_id: uuid.UUID) -> FeedPurchase:
        return await self._get(
            FeedPurchase, item_id, error_msg="Feed purchase not found"
        )

    async def create_purchase(self, data) -> FeedPurchase:
        item = await self._create(FeedPurchase, data)
        await self._invalidate()
        return item

    async def update_purchase(self, item_id: uuid.UUID, data) -> FeedPurchase:
        item = await self._update(
            FeedPurchase, item_id, data, error_msg="Feed purchase not found"
        )
        await self._invalidate()
        return item

    async def delete_purchase(self, item_id: uuid.UUID) -> None:
        await self._soft_delete(
            FeedPurchase, item_id, error_msg="Feed purchase not found"
        )
        await self._invalidate()

    # ── Consumo ──────────────────────────────────────────────────────

    async def list_consumption(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(FeedConsumption, page=page, size=size)

    async def get_consumption(self, item_id: uuid.UUID) -> FeedConsumption:
        return await self._get(
            FeedConsumption, item_id, error_msg="Feed consumption not found"
        )

    async def create_consumption(self, data) -> FeedConsumption:
        item = await self._create(FeedConsumption, data)
        await self._invalidate()
        return item

    async def update_consumption(self, item_id: uuid.UUID, data) -> FeedConsumption:
        item = await self._update(
            FeedConsumption, item_id, data, error_msg="Feed consumption not found"
        )
        await self._invalidate()
        return item

    async def delete_consumption(self, item_id: uuid.UUID) -> None:
        await self._delete(
            FeedConsumption, item_id, error_msg="Feed consumption not found"
        )
        await self._invalidate()
