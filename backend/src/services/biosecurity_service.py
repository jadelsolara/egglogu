"""BiosecurityService — Visitantes, zonas, plagas, protocolos."""

import uuid

from src.models.biosecurity import (
    BiosecurityProtocol,
    BiosecurityVisitor,
    BiosecurityZone,
    PestSighting,
)
from src.services.base import BaseService


class BiosecurityService(BaseService):

    # ── Visitantes ───────────────────────────────────────────────────

    async def list_visitors(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(BiosecurityVisitor, page=page, size=size)

    async def create_visitor(self, data) -> BiosecurityVisitor:
        return await self._create(BiosecurityVisitor, data)

    async def update_visitor(self, item_id: uuid.UUID, data) -> BiosecurityVisitor:
        return await self._update(
            BiosecurityVisitor, item_id, data, error_msg="Visitor not found"
        )

    async def delete_visitor(self, item_id: uuid.UUID) -> None:
        await self._delete(BiosecurityVisitor, item_id, error_msg="Visitor not found")

    # ── Zonas ────────────────────────────────────────────────────────

    async def list_zones(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(BiosecurityZone, page=page, size=size)

    async def create_zone(self, data) -> BiosecurityZone:
        return await self._create(BiosecurityZone, data)

    async def update_zone(self, item_id: uuid.UUID, data) -> BiosecurityZone:
        return await self._update(
            BiosecurityZone, item_id, data, error_msg="Zone not found"
        )

    async def delete_zone(self, item_id: uuid.UUID) -> None:
        await self._delete(BiosecurityZone, item_id, error_msg="Zone not found")

    # ── Plagas ───────────────────────────────────────────────────────

    async def list_pests(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(PestSighting, page=page, size=size)

    async def create_pest(self, data) -> PestSighting:
        return await self._create(PestSighting, data)

    async def update_pest(self, item_id: uuid.UUID, data) -> PestSighting:
        return await self._update(
            PestSighting, item_id, data, error_msg="Pest sighting not found"
        )

    async def delete_pest(self, item_id: uuid.UUID) -> None:
        await self._delete(PestSighting, item_id, error_msg="Pest sighting not found")

    # ── Protocolos ───────────────────────────────────────────────────

    async def list_protocols(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(BiosecurityProtocol, page=page, size=size)

    async def create_protocol(self, data) -> BiosecurityProtocol:
        return await self._create(BiosecurityProtocol, data)

    async def update_protocol(self, item_id: uuid.UUID, data) -> BiosecurityProtocol:
        return await self._update(
            BiosecurityProtocol, item_id, data, error_msg="Protocol not found"
        )

    async def delete_protocol(self, item_id: uuid.UUID) -> None:
        await self._delete(
            BiosecurityProtocol, item_id, error_msg="Protocol not found"
        )
