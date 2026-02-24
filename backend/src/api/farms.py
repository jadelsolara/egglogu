import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.farm import Farm
from src.schemas.farm import FarmCreate, FarmRead, FarmReadPublic, FarmUpdate

router = APIRouter(prefix="/farms", tags=["farms"])


@router.get("/", response_model=list[FarmReadPublic])
async def list_farms(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Farm).where(Farm.organization_id == user.organization_id)
    )
    return result.scalars().all()


@router.get("/{farm_id}", response_model=FarmReadPublic)
async def get_farm(
    farm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Farm).where(
            Farm.id == farm_id, Farm.organization_id == user.organization_id
        )
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise NotFoundError("Farm not found")
    return farm


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
    result = await db.execute(
        select(Farm).where(
            Farm.id == farm_id, Farm.organization_id == user.organization_id
        )
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise NotFoundError("Farm not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(farm, key, value)
    await db.flush()
    await db.refresh(farm)
    return farm


@router.delete("/{farm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_farm(
    farm_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Farm).where(
            Farm.id == farm_id, Farm.organization_id == user.organization_id
        )
    )
    farm = result.scalar_one_or_none()
    if not farm:
        raise NotFoundError("Farm not found")
    await db.delete(farm)
