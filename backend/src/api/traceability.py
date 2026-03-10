"""
Traceability API — Core product batch tracking (FarmLogU Platform).

Works for any vertical: eggs, pork, beef, dairy, crops.
Batch code format: {PREFIX}-{ORIGIN}-{DATE}-{SEQ}
"""

import uuid
from datetime import date as date_type

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.config import settings
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.traceability import TraceabilityBatch, ProductCategory
from src.schemas.traceability import (
    TraceabilityBatchCreate,
    TraceabilityBatchRead,
    TraceabilityBatchUpdate,
)

router = APIRouter(prefix="/traceability", tags=["traceability"])


# ── Batch code prefix by product category ──
CATEGORY_PREFIX = {
    ProductCategory.EGGS: "EGG",
    ProductCategory.POULTRY_MEAT: "PLT",
    ProductCategory.PORK: "PRK",
    ProductCategory.BEEF: "BEF",
    ProductCategory.DAIRY: "DRY",
    ProductCategory.CROPS: "CRP",
    ProductCategory.FEED: "FED",
    ProductCategory.BYPRODUCT: "BYP",
    ProductCategory.OTHER: "OTH",
}


async def _generate_batch_code(
    category: ProductCategory,
    origin_name: str | None,
    batch_date: date_type,
    db: AsyncSession,
) -> str:
    """Generate batch code: {CAT}-{ORIGIN}-{DATE}-{SEQ}

    Examples:
    - EGG-LOTE1-20260308-001 (eggs from flock LOTE1)
    - PRK-BARN2-20260308-001 (pork from barn 2)
    - DRY-HERD3-20260308-001 (dairy from herd 3)
    """
    prefix = CATEGORY_PREFIX.get(category, "OTH")
    origin_short = (origin_name or "GEN")[:8].upper().replace(" ", "")
    date_str = batch_date.strftime("%Y%m%d")
    code_prefix = f"{prefix}-{origin_short}-{date_str}"

    count_result = await db.execute(
        select(func.count()).where(
            TraceabilityBatch.batch_code.like(f"{code_prefix}%")
        )
    )
    seq = (count_result.scalar() or 0) + 1
    return f"{code_prefix}-{seq:03d}"


@router.get("/batches", response_model=list[TraceabilityBatchRead])
async def list_batches(
    category: ProductCategory | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    stmt = (
        select(TraceabilityBatch)
        .where(TraceabilityBatch.organization_id == user.organization_id)
    )
    if category:
        stmt = stmt.where(TraceabilityBatch.product_category == category)
    stmt = stmt.order_by(TraceabilityBatch.date.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/batches/{batch_id}", response_model=TraceabilityBatchRead)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    result = await db.execute(
        select(TraceabilityBatch).where(
            TraceabilityBatch.id == batch_id,
            TraceabilityBatch.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Batch not found")
    return obj


@router.post(
    "/batches",
    response_model=TraceabilityBatchRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_batch(
    data: TraceabilityBatchCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    # Resolve origin name for batch code
    origin_name = data.origin_location
    if not origin_name and data.source_id:
        # Try to get a readable name from the source
        origin_name = str(data.source_id)[:8]

    batch_code = await _generate_batch_code(
        data.product_category, origin_name, data.date, db
    )
    qr_url = f"{settings.FRONTEND_URL}/trace/{batch_code}"

    obj = TraceabilityBatch(
        **data.model_dump(),
        batch_code=batch_code,
        qr_code=qr_url,
        organization_id=user.organization_id,
    )
    db.add(obj)
    await db.flush()
    return obj


@router.put("/batches/{batch_id}", response_model=TraceabilityBatchRead)
async def update_batch(
    batch_id: uuid.UUID,
    data: TraceabilityBatchUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    result = await db.execute(
        select(TraceabilityBatch).where(
            TraceabilityBatch.id == batch_id,
            TraceabilityBatch.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Batch not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    result = await db.execute(
        select(TraceabilityBatch).where(
            TraceabilityBatch.id == batch_id,
            TraceabilityBatch.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Batch not found")
    await db.delete(obj)
