"""FarmService — Gestión de granjas."""

import uuid

from src.models.farm import Farm
from src.services.base import BaseService


class FarmService(BaseService):

    async def list_farms(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Farm, page=page, size=size)

    async def get_farm(self, farm_id: uuid.UUID) -> Farm:
        return await self._get(Farm, farm_id, error_msg="Farm not found")

    async def create_farm(self, data) -> Farm:
        return await self._create(Farm, data)

    async def update_farm(self, farm_id: uuid.UUID, data) -> Farm:
        return await self._update(Farm, farm_id, data, error_msg="Farm not found")

    async def delete_farm(self, farm_id: uuid.UUID) -> None:
        return await self._delete(Farm, farm_id, error_msg="Farm not found")
