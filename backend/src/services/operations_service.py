"""OperationsService — Checklist, bitácora, personal."""

import uuid

from src.models.operations import ChecklistItem, LogbookEntry, Personnel
from src.services.base import BaseService


class OperationsService(BaseService):
    # ── Checklist ────────────────────────────────────────────────────

    async def list_checklist(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(ChecklistItem, page=page, size=size)

    async def get_checklist(self, item_id: uuid.UUID) -> ChecklistItem:
        return await self._get(
            ChecklistItem, item_id, error_msg="Checklist item not found"
        )

    async def create_checklist(self, data) -> ChecklistItem:
        return await self._create(ChecklistItem, data)

    async def update_checklist(self, item_id: uuid.UUID, data) -> ChecklistItem:
        return await self._update(
            ChecklistItem, item_id, data, error_msg="Checklist item not found"
        )

    async def delete_checklist(self, item_id: uuid.UUID) -> None:
        await self._soft_delete(
            ChecklistItem, item_id, error_msg="Checklist item not found"
        )

    # ── Bitácora ─────────────────────────────────────────────────────

    async def list_logbook(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(LogbookEntry, page=page, size=size)

    async def get_logbook(self, item_id: uuid.UUID) -> LogbookEntry:
        return await self._get(
            LogbookEntry, item_id, error_msg="Logbook entry not found"
        )

    async def create_logbook(self, data) -> LogbookEntry:
        return await self._create(LogbookEntry, data)

    async def update_logbook(self, item_id: uuid.UUID, data) -> LogbookEntry:
        return await self._update(
            LogbookEntry, item_id, data, error_msg="Logbook entry not found"
        )

    async def delete_logbook(self, item_id: uuid.UUID) -> None:
        await self._delete(LogbookEntry, item_id, error_msg="Logbook entry not found")

    # ── Personal ─────────────────────────────────────────────────────

    async def list_personnel(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Personnel, page=page, size=size)

    async def get_personnel(self, item_id: uuid.UUID) -> Personnel:
        return await self._get(Personnel, item_id, error_msg="Personnel not found")

    async def create_personnel(self, data) -> Personnel:
        return await self._create(Personnel, data)

    async def update_personnel(self, item_id: uuid.UUID, data) -> Personnel:
        return await self._update(
            Personnel, item_id, data, error_msg="Personnel not found"
        )

    async def delete_personnel(self, item_id: uuid.UUID) -> None:
        await self._soft_delete(Personnel, item_id, error_msg="Personnel not found")
