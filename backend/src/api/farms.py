import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.models.farm import Farm
from src.schemas.farm import FarmCreate, FarmRead, FarmReadPublic, FarmUpdate
from src.services.tenant_service import TenantService

router = APIRouter(prefix="/farms", tags=["farms"])


@router.get("/", response_model=list[FarmReadPublic])
async def list_farms(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        TenantService.scoped_query(Farm, user.organization_id)
        .order_by(Farm.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{farm_id}", response_model=FarmReadPublic)
async def get_farm(
    farm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await TenantService.get_one(
        db, Farm, farm_id, user.organization_id, error_msg="Farm not found"
    )


@router.post("/", response_model=FarmRead, status_code=status.HTTP_201_CREATED)
async def create_farm(
    data: FarmCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    farm = Farm(**data.model_dump(), organization_id=user.organization_id)
    db.add(farm)
    await db.flush()
    return farm


@router.put("/{farm_id}", response_model=FarmRead)
async def update_farm(
    farm_id: uuid.UUID,
    data: FarmUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    farm = await TenantService.update_fields(
        db, Farm, farm_id, user.organization_id,
        data.model_dump(exclude_unset=True), error_msg="Farm not found",
    )
    await db.refresh(farm)
    return farm


@router.delete("/{farm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_farm(
    farm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    farm = await TenantService.get_one(
        db, Farm, farm_id, user.organization_id, error_msg="Farm not found"
    )
    await db.delete(farm)
