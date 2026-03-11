import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.cache import invalidate_prefix
from src.database import get_db
from src.models.auth import User
from src.models.production import DailyProduction
from src.schemas.production import (
    DailyProductionCreate,
    DailyProductionRead,
    DailyProductionUpdate,
)
from src.services.tenant_service import TenantService

router = APIRouter(prefix="/production", tags=["production"])


@router.get("/", response_model=list[DailyProductionRead])
async def list_production(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        TenantService.scoped_query(DailyProduction, user.organization_id)
        .order_by(DailyProduction.id)
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
    return await TenantService.get_one(
        db, DailyProduction, record_id, user.organization_id,
        error_msg="Production record not found",
    )


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
    await invalidate_prefix(f"economics:{user.organization_id}")
    return record


@router.put("/{record_id}", response_model=DailyProductionRead)
async def update_production(
    record_id: uuid.UUID,
    data: DailyProductionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = await TenantService.update_fields(
        db, DailyProduction, record_id, user.organization_id,
        data.model_dump(exclude_unset=True), error_msg="Production record not found",
    )
    await invalidate_prefix(f"economics:{user.organization_id}")
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_production(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = await TenantService.get_one(
        db, DailyProduction, record_id, user.organization_id,
        error_msg="Production record not found",
    )
    await db.delete(record)
    await invalidate_prefix(f"economics:{user.organization_id}")
