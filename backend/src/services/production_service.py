"""ProductionService — Registro de producción diaria."""

import uuid

from src.core.cache import invalidate_prefix
from src.models.production import DailyProduction
from src.services.base import BaseService


class ProductionService(BaseService):
    async def _invalidate(self) -> None:
        await invalidate_prefix(f"economics:{self.org_id}")

    async def list_production(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(DailyProduction, page=page, size=size)

    async def get_production(self, record_id: uuid.UUID) -> DailyProduction:
        return await self._get(
            DailyProduction, record_id, error_msg="Production record not found"
        )

    async def create_production(self, data) -> DailyProduction:
        record = await self._create(DailyProduction, data)
        await self._invalidate()
        return record

    async def update_production(self, record_id: uuid.UUID, data) -> DailyProduction:
        record = await self._update(
            DailyProduction,
            record_id,
            data,
            error_msg="Production record not found",
        )
        await self._invalidate()
        return record

    async def delete_production(self, record_id: uuid.UUID) -> None:
        await self._delete(
            DailyProduction, record_id, error_msg="Production record not found"
        )
        await self._invalidate()
