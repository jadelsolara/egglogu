from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.models import (
    Farm, Flock, DailyProduction, Vaccine, Medication, Outbreak, StressEvent,
    FeedPurchase, FeedConsumption, Client, Income, Expense, Receivable,
    EnvironmentReading, IoTReading, WeatherCache, ChecklistItem, LogbookEntry, Personnel,
)

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
    data: dict[str, list[dict[str, Any]]] = {}


class SyncResponse(BaseModel):
    synced: int
    conflicts: list[str]


@router.post("/", response_model=SyncResponse)
async def sync_data(
    payload: SyncPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    synced = 0
    conflicts: list[str] = []

    for entity_key, records in payload.data.items():
        model_cls = MODEL_MAP.get(entity_key)
        if not model_cls:
            conflicts.append(f"Unknown entity: {entity_key}")
            continue

        for record_data in records:
            record_data.pop("id", None)
            record_data["organization_id"] = user.organization_id
            try:
                obj = model_cls(**record_data)
                db.add(obj)
                synced += 1
            except Exception as e:
                conflicts.append(f"{entity_key}: {e}")

    await db.flush()
    return SyncResponse(synced=synced, conflicts=conflicts)
