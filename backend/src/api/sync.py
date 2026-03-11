"""Delta-sync endpoint for EGGlogU offline-first PWA.

Strategy:
  1. Client sends `last_synced_at` timestamp + changed records per entity.
  2. Server upserts changed records (merge by UUID or insert).
  3. Server returns all records modified since `last_synced_at` so the client
     can update its local IndexedDB.
  4. Conflict resolution: last-write-wins based on `updated_at`.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.services.sync_service import SyncService

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncPayload(BaseModel):
    last_synced_at: datetime | None = None
    data: dict[str, list[dict[str, Any]]] = {}


class SyncResponse(BaseModel):
    synced: int
    conflicts: list[str]
    conflict_count: int = 0
    server_changes: dict[str, list[dict[str, Any]]]
    server_now: str
    sync_cursor: str | None = None


@router.post("/", response_model=SyncResponse)
async def sync_data(
    payload: SyncPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sincronización delta bidireccional entre cliente y servidor."""
    svc = SyncService(db, user.organization_id, user.id)
    result = await svc.sync(payload.data, payload.last_synced_at)
    return SyncResponse(**result)
