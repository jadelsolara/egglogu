"""FlockService — Gestión de lotes de aves."""

import uuid

from src.models.flock import Flock
from src.services.base import BaseService


class FlockService(BaseService):
    async def list_flocks(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Flock, page=page, size=size)

    async def get_flock(self, flock_id: uuid.UUID) -> Flock:
        return await self._get(Flock, flock_id, error_msg="Flock not found")

    async def create_flock(self, data) -> Flock:
        return await self._create(Flock, data)

    async def update_flock(self, flock_id: uuid.UUID, data) -> Flock:
        return await self._update(Flock, flock_id, data, error_msg="Flock not found")

    async def delete_flock(self, flock_id: uuid.UUID) -> None:
        return await self._delete(Flock, flock_id, error_msg="Flock not found")
