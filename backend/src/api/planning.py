import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.planning import ProductionPlan
from src.schemas.planning import (
    ProductionPlanCreate,
    ProductionPlanRead,
    ProductionPlanUpdate,
)

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("/plans", response_model=list[ProductionPlanRead])
async def list_plans(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    stmt = select(ProductionPlan).where(ProductionPlan.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/plans/{plan_id}", response_model=ProductionPlanRead)
async def get_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    result = await db.execute(
        select(ProductionPlan).where(
            ProductionPlan.id == plan_id,
            ProductionPlan.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Production plan not found")
    return obj


@router.post(
    "/plans", response_model=ProductionPlanRead, status_code=status.HTTP_201_CREATED
)
async def create_plan(
    data: ProductionPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    obj = ProductionPlan(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/plans/{plan_id}", response_model=ProductionPlanRead)
async def update_plan(
    plan_id: uuid.UUID,
    data: ProductionPlanUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    result = await db.execute(
        select(ProductionPlan).where(
            ProductionPlan.id == plan_id,
            ProductionPlan.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Production plan not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    result = await db.execute(
        select(ProductionPlan).where(
            ProductionPlan.id == plan_id,
            ProductionPlan.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Production plan not found")
    await db.delete(obj)
