"""
Public traceability endpoint — NO AUTH required.

A client or food inspector scans the QR code on an egg box/tray,
which resolves to GET /trace/{batch_code}. This returns origin,
flock, farm, and logistics info for that batch.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.flock import Flock
from src.models.traceability import TraceabilityBatch
from src.schemas.traceability import (
    TraceFarmInfo,
    TraceFlockInfo,
    TracePublicResponse,
)

router = APIRouter(prefix="/trace", tags=["traceability-public"])


@router.get("/{batch_code}", response_model=TracePublicResponse)
async def public_trace(batch_code: str, db: AsyncSession = Depends(get_db)):
    """
    Public endpoint: scan QR → get batch origin info.
    No authentication required.
    """
    result = await db.execute(
        select(TraceabilityBatch)
        .options(
            selectinload(TraceabilityBatch.flock).selectinload(Flock.farm),
            selectinload(TraceabilityBatch.client),
        )
        .where(TraceabilityBatch.batch_code == batch_code)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise NotFoundError("Batch not found. This code may be invalid or expired.")

    # Build flock info
    flock_info = None
    farm_info = None
    if batch.flock:
        flock_info = TraceFlockInfo(
            name=batch.flock.name,
            breed=batch.flock.breed,
            housing_type=batch.flock.housing_type,
            start_date=batch.flock.start_date,
        )
        if batch.flock.farm:
            farm_info = TraceFarmInfo(name=batch.flock.farm.name)

    return TracePublicResponse(
        batch_code=batch.batch_code,
        date=batch.date,
        total_eggs=batch.box_count * batch.eggs_per_box,
        box_count=batch.box_count,
        eggs_per_box=batch.eggs_per_box,
        egg_type=batch.egg_type,
        house=batch.house,
        delivery_date=batch.delivery_date,
        flock=flock_info,
        farm=farm_info,
        packed_at=batch.created_at,
    )
