"""BaseService — Corazón de la fábrica de ERPs.

Todas las operaciones CRUD tenant-scoped viven aquí.
Los servicios de dominio heredan y extienden.

Patrón: BaseService(db, org_id, user_id) → CRUD genérico
"""

import uuid
from datetime import datetime, timezone
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from src.core.exceptions import NotFoundError

T = TypeVar("T")


class BaseService:
    """Servicio base con operaciones CRUD tenant-scoped."""

    def __init__(self, db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id

    # ── Query helpers ────────────────────────────────────────────────

    def _scoped(self, model: type) -> Select:
        """SELECT con filtro de organización + soft-delete."""
        stmt = select(model).where(model.organization_id == self.org_id)
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        return stmt

    # ── CRUD genérico ────────────────────────────────────────────────

    async def _list(
        self, model: type, *, page: int = 1, size: int = 50, order_by: Any = None
    ) -> list:
        stmt = self._scoped(model)
        stmt = stmt.order_by(order_by if order_by is not None else model.id)
        stmt = stmt.offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _get(
        self, model: type, record_id: uuid.UUID, *, error_msg: str | None = None
    ) -> Any:
        stmt = (
            select(model)
            .where(model.id == record_id, model.organization_id == self.org_id)
        )
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        result = await self.db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError(error_msg or f"{model.__name__} not found")
        return obj

    async def _create(self, model: type, data: Any) -> Any:
        obj = model(**data.model_dump(), organization_id=self.org_id)
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def _update(
        self,
        model: type,
        record_id: uuid.UUID,
        data: Any,
        *,
        error_msg: str | None = None,
    ) -> Any:
        obj = await self._get(model, record_id, error_msg=error_msg)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        await self.db.flush()
        return obj

    async def _delete(
        self, model: type, record_id: uuid.UUID, *, error_msg: str | None = None
    ) -> None:
        obj = await self._get(model, record_id, error_msg=error_msg)
        await self.db.delete(obj)

    async def _soft_delete(
        self, model: type, record_id: uuid.UUID, *, error_msg: str | None = None
    ) -> None:
        obj = await self._get(model, record_id, error_msg=error_msg)
        obj.deleted_at = datetime.now(timezone.utc)
