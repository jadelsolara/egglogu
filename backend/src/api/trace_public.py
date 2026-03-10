"""
Public traceability endpoint — NO AUTH required.

A client or food inspector scans the QR code on a product package,
which resolves to GET /trace/{batch_code}. Returns origin, farm,
and logistics info for that batch. Works for any FarmLogU vertical.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import NotFoundError, RateLimitError
from src.core.rate_limit import check_rate_limit
from src.database import get_db
from src.models.traceability import TraceabilityBatch
from src.schemas.traceability import (
    TraceFarmInfo,
    TraceOriginInfo,
    TracePublicResponse,
)

router = APIRouter(prefix="/trace", tags=["traceability-public"])


@router.get("/{batch_code}", response_model=TracePublicResponse)
async def public_trace(
    batch_code: str, request: Request, db: AsyncSession = Depends(get_db)
):
    """
    Public endpoint: scan QR -> get batch origin info.
    No authentication required. Rate limited per IP.
    Works for any product category (eggs, pork, dairy, crops, etc.).
    """
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(
        f"trace:{client_ip}", max_requests=30, window_seconds=60
    ):
        raise RateLimitError("Too many requests. Please try again later.")

    result = await db.execute(
        select(TraceabilityBatch)
        .options(
            selectinload(TraceabilityBatch.farm),
            selectinload(TraceabilityBatch.client),
        )
        .where(TraceabilityBatch.batch_code == batch_code)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise NotFoundError("Batch not found. This code may be invalid or expired.")

    # Build origin info (generic — works for flock, herd, field)
    farm_info = None
    origin_info = None

    if batch.farm:
        farm_info = TraceFarmInfo(name=batch.farm.name)

    if batch.source_id:
        origin_info = TraceOriginInfo(
            name=batch.origin_location,
            type=batch.source_type,
        )

    return TracePublicResponse(
        batch_code=batch.batch_code,
        date=batch.date,
        product_category=batch.product_category.value,
        product_name=batch.product_name,
        product_type=batch.product_type,
        quantity=batch.quantity,
        unit_of_measure=batch.unit_of_measure,
        container_count=batch.container_count,
        units_per_container=batch.units_per_container,
        quality_grade=batch.quality_grade,
        origin_location=batch.origin_location,
        delivery_date=batch.delivery_date,
        best_before=batch.best_before,
        farm=farm_info,
        origin=origin_info,
        packed_at=batch.created_at,
    )
