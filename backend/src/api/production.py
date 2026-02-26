import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.production import DailyProduction
from src.schemas.production import (
    DailyProductionCreate,
    DailyProductionRead,
    DailyProductionUpdate,
)

router = APIRouter(prefix="/production", tags=["production"])


@router.get("/", response_model=list[DailyProductionRead])
async def list_production(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(DailyProduction)
        .where(DailyProduction.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{record_id}", response_model=DailyProductionRead)
async def get_production(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyProduction).where(
            DailyProduction.id == record_id,
            DailyProduction.organization_id == user.organization_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("Production record not found")
    return record


@router.post(
    "/", response_model=DailyProductionRead, status_code=status.HTTP_201_CREATED
)
async def create_production(
    data: DailyProductionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = DailyProduction(**data.model_dump(), organization_id=user.organization_id)
    db.add(record)
    await db.flush()
    return record


@router.put("/{record_id}", response_model=DailyProductionRead)
async def update_production(
    record_id: uuid.UUID,
    data: DailyProductionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyProduction).where(
            DailyProduction.id == record_id,
            DailyProduction.organization_id == user.organization_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("Production record not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(record, key, value)
    await db.flush()
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_production(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DailyProduction).where(
            DailyProduction.id == record_id,
            DailyProduction.organization_id == user.organization_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise NotFoundError("Production record not found")
    await db.delete(record)
