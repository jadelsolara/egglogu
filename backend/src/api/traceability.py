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
from src.models.flock import Flock
from src.models.traceability import TraceabilityBatch
from src.schemas.traceability import (
    TraceabilityBatchCreate,
    TraceabilityBatchRead,
    TraceabilityBatchUpdate,
)

router = APIRouter(prefix="/traceability", tags=["traceability"])


async def _generate_batch_code(
    flock_id: uuid.UUID, batch_date: date_type, db: AsyncSession
) -> str:
    """Generate batch code like BOX-FlockName-20260210-001."""
    # Get flock name for readable code
    result = await db.execute(select(Flock.name).where(Flock.id == flock_id))
    flock_name = result.scalar_one_or_none() or "UNK"
    # Sanitize: take first 8 chars, uppercase, no spaces
    flock_short = flock_name[:8].upper().replace(" ", "")

    date_str = batch_date.strftime("%Y%m%d")
    prefix = f"BOX-{flock_short}-{date_str}"

    # Count existing batches with same prefix to get sequence number
    count_result = await db.execute(
        select(func.count()).where(TraceabilityBatch.batch_code.like(f"{prefix}%"))
    )
    seq = (count_result.scalar() or 0) + 1

    return f"{prefix}-{seq:03d}"


@router.get("/batches", response_model=list[TraceabilityBatchRead])
async def list_batches(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    stmt = (
        select(TraceabilityBatch)
        .where(TraceabilityBatch.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
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
    batch_code = await _generate_batch_code(data.flock_id, data.date, db)
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
