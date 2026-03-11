import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.production import (
    DailyProductionCreate,
    DailyProductionRead,
    DailyProductionUpdate,
)
from src.services.production_service import ProductionService

router = APIRouter(prefix="/production", tags=["production"])


@router.get("/", response_model=list[DailyProductionRead])
async def list_production(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProductionService(db, user.organization_id, user.id)
    return await svc.list_production(page=page, size=size)


@router.get("/{record_id}", response_model=DailyProductionRead)
async def get_production(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProductionService(db, user.organization_id, user.id)
    return await svc.get_production(record_id)


@router.post(
    "/", response_model=DailyProductionRead, status_code=status.HTTP_201_CREATED
)
async def create_production(
    data: DailyProductionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProductionService(db, user.organization_id, user.id)
    return await svc.create_production(data)


@router.put("/{record_id}", response_model=DailyProductionRead)
async def update_production(
    record_id: uuid.UUID,
    data: DailyProductionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProductionService(db, user.organization_id, user.id)
    return await svc.update_production(record_id, data)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_production(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = ProductionService(db, user.organization_id, user.id)
    await svc.delete_production(record_id)
