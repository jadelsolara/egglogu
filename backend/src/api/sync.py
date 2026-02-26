"""Delta-sync endpoint for EGGlogU offline-first PWA.

Strategy:
  1. Client sends `last_synced_at` timestamp + changed records per entity.
  2. Server upserts changed records (merge by UUID or insert).
  3. Server returns all records modified since `last_synced_at` so the client
     can update its local IndexedDB.
  4. Conflict resolution: last-write-wins based on `updated_at`.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.models import (
    Farm,
    Flock,
    DailyProduction,
    Vaccine,
    Medication,
    Outbreak,
    StressEvent,
    FeedPurchase,
    FeedConsumption,
    Client,
    Income,
    Expense,
    Receivable,
    EnvironmentReading,
    IoTReading,
    WeatherCache,
    ChecklistItem,
    LogbookEntry,
    Personnel,
)

logger = logging.getLogger("egglogu.sync")

router = APIRouter(prefix="/sync", tags=["sync"])

MODEL_MAP = {
    "farms": Farm,
    "flocks": Flock,
    "production": DailyProduction,
    "vaccines": Vaccine,
    "medications": Medication,
    "outbreaks": Outbreak,
    "stress_events": StressEvent,
    "feed_purchases": FeedPurchase,
    "feed_consumption": FeedConsumption,
    "clients": Client,
    "incomes": Income,
    "expenses": Expense,
    "receivables": Receivable,
    "environment_readings": EnvironmentReading,
    "iot_readings": IoTReading,
    "weather_cache": WeatherCache,
    "checklist_items": ChecklistItem,
    "logbook_entries": LogbookEntry,
    "personnel": Personnel,
}


class SyncPayload(BaseModel):
    last_synced_at: datetime | None = None
    data: dict[str, list[dict[str, Any]]] = {}


class SyncResponse(BaseModel):
    synced: int
    conflicts: list[str]
    server_changes: dict[str, list[dict[str, Any]]]
    server_now: str


@router.post("/", response_model=SyncResponse)
async def sync_data(
    payload: SyncPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    synced = 0
    conflicts: list[str] = []
    server_now = datetime.now(timezone.utc)

    logger.info(
        "Sync request from user=%s org=%s entities=%d last_synced=%s",
        user.id,
        user.organization_id,
        len(payload.data),
        payload.last_synced_at,
    )

    # ── Phase 1: Upsert client changes ──
    for entity_key, records in payload.data.items():
        model_cls = MODEL_MAP.get(entity_key)
        if not model_cls:
            conflicts.append(f"Unknown entity: {entity_key}")
            logger.warning("Unknown sync entity: %s", entity_key)
            continue

        valid_cols = {c.key for c in model_cls.__table__.columns}

        for record_data in records:
            record_id = record_data.pop("id", None)
            record_data["organization_id"] = user.organization_id
            filtered = {k: v for k, v in record_data.items() if k in valid_cols}

            try:
                if record_id:
                    existing = await db.get(model_cls, record_id)
                    if existing and existing.organization_id == user.organization_id:
                        client_updated = record_data.get("updated_at")
                        if client_updated and existing.updated_at:
                            if isinstance(client_updated, str):
                                client_updated = datetime.fromisoformat(client_updated)
                            if client_updated <= existing.updated_at:
                                conflicts.append(
                                    f"{entity_key}/{record_id}: server is newer"
                                )
                                continue
                        for k, v in filtered.items():
                            if k not in ("id", "organization_id", "created_at"):
                                setattr(existing, k, v)
                        synced += 1
                        continue

                filtered.pop("id", None)
                obj = model_cls(**filtered)
                db.add(obj)
                synced += 1
            except IntegrityError as e:
                await db.rollback()
                conflicts.append(f"{entity_key}: FK violation — {e.orig}")
                logger.error("Sync IntegrityError on %s: %s", entity_key, e.orig)
            except Exception as e:
                conflicts.append(f"{entity_key}: {e}")
                logger.error("Sync error on %s: %s", entity_key, e)

    await db.flush()

    # ── Phase 2: Return server changes since last_synced_at ──
    server_changes: dict[str, list[dict[str, Any]]] = {}
    since = payload.last_synced_at or datetime.min.replace(tzinfo=timezone.utc)

    for entity_key, model_cls in MODEL_MAP.items():
        if not hasattr(model_cls, "updated_at") or not hasattr(
            model_cls, "organization_id"
        ):
            continue
        stmt = (
            select(model_cls)
            .where(
                model_cls.organization_id == user.organization_id,
                model_cls.updated_at > since,
            )
            .order_by(model_cls.updated_at)
            .limit(500)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        if rows:
            server_changes[entity_key] = [_row_to_dict(r) for r in rows]

    logger.info(
        "Sync complete: synced=%d conflicts=%d changes_returned=%d",
        synced,
        len(conflicts),
        sum(len(v) for v in server_changes.values()),
    )

    return SyncResponse(
        synced=synced,
        conflicts=conflicts,
        server_changes=server_changes,
        server_now=server_now.isoformat(),
    )


def _row_to_dict(obj: Any) -> dict[str, Any]:
    """Convert a SQLAlchemy model instance to a JSON-safe dict."""
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.key, None)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif hasattr(val, "hex"):  # UUID
            val = str(val)
        result[col.key] = val
    return result
