import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.farm import FarmCreate, FarmRead, FarmReadPublic, FarmUpdate
from src.services.farm_service import FarmService

router = APIRouter(prefix="/farms", tags=["farms"])


@router.get("/", response_model=list[FarmReadPublic])
async def list_farms(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FarmService(db, user.organization_id, user.id)
    return await svc.list_farms(page=page, size=size)


@router.get("/{farm_id}", response_model=FarmReadPublic)
async def get_farm(
    farm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FarmService(db, user.organization_id, user.id)
    return await svc.get_farm(farm_id)


@router.post("/", response_model=FarmRead, status_code=status.HTTP_201_CREATED)
async def create_farm(
    data: FarmCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FarmService(db, user.organization_id, user.id)
    return await svc.create_farm(data)


@router.put("/{farm_id}", response_model=FarmRead)
async def update_farm(
    farm_id: uuid.UUID,
    data: FarmUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FarmService(db, user.organization_id, user.id)
    return await svc.update_farm(farm_id, data)


@router.delete("/{farm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_farm(
    farm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FarmService(db, user.organization_id, user.id)
    await svc.delete_farm(farm_id)
