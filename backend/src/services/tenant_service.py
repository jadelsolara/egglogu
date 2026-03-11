"""Centralized tenant validation and filtering.

Provides reusable tenant-scoped query helpers to avoid
repeating organization_id + deleted_at filters in every route.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from src.core.exceptions import ForbiddenError, NotFoundError

T = TypeVar("T")


class TenantService:
    """Centralized multi-tenant query helpers."""

    @staticmethod
    def scoped_query(model: type, org_id: uuid.UUID) -> Select:
        """Build a base SELECT scoped to an organization + soft-delete filter.

        Usage:
            stmt = TenantService.scoped_query(Farm, user.organization_id)
            result = await db.execute(stmt)
        """
        stmt = select(model).where(model.organization_id == org_id)
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        return stmt

    @staticmethod
    async def get_one(
        db: AsyncSession,
        model: type,
        record_id: uuid.UUID,
        org_id: uuid.UUID,
        *,
        error_msg: str | None = None,
    ) -> Any:
        """Fetch a single tenant-scoped record by ID. Raises NotFoundError."""
        stmt = select(model).where(
            model.id == record_id, model.organization_id == org_id
        )
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        result = await db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError(error_msg or f"{model.__name__} not found")
        return obj

    @staticmethod
    async def soft_delete(
        db: AsyncSession,
        model: type,
        record_id: uuid.UUID,
        org_id: uuid.UUID,
        *,
        error_msg: str | None = None,
    ) -> None:
        """Soft-delete a tenant-scoped record. Raises NotFoundError if missing."""
        obj = await TenantService.get_one(
            db, model, record_id, org_id, error_msg=error_msg
        )
        obj.deleted_at = datetime.now(timezone.utc)

    @staticmethod
    async def update_fields(
        db: AsyncSession,
        model: type,
        record_id: uuid.UUID,
        org_id: uuid.UUID,
        data: dict[str, Any],
        *,
        error_msg: str | None = None,
    ) -> Any:
        """Fetch + update fields on a tenant-scoped record. Returns updated obj."""
        obj = await TenantService.get_one(
            db, model, record_id, org_id, error_msg=error_msg
        )
        for key, value in data.items():
            setattr(obj, key, value)
        await db.flush()
        return obj

    @staticmethod
    def validate_tenant(record_org_id: uuid.UUID, user_org_id: uuid.UUID) -> None:
        """Assert that a record belongs to the user's org. Raises ForbiddenError."""
        if record_org_id != user_org_id:
            raise ForbiddenError("Access denied — resource belongs to another tenant")
