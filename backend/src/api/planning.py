import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.planning import (
    ProductionPlanCreate,
    ProductionPlanRead,
    ProductionPlanUpdate,
)
from src.services.planning_service import PlanningService

router = APIRouter(prefix="/planning", tags=["planning"])


@router.get("/plans", response_model=list[ProductionPlanRead])
async def list_plans(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    svc = PlanningService(db, user.organization_id, user.id)
    return await svc.list_plans(page=page, size=size)


@router.get("/plans/{plan_id}", response_model=ProductionPlanRead)
async def get_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    svc = PlanningService(db, user.organization_id, user.id)
    return await svc.get_plan(plan_id)


@router.post(
    "/plans", response_model=ProductionPlanRead, status_code=status.HTTP_201_CREATED
)
async def create_plan(
    data: ProductionPlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    svc = PlanningService(db, user.organization_id, user.id)
    return await svc.create_plan(data)


@router.put("/plans/{plan_id}", response_model=ProductionPlanRead)
async def update_plan(
    plan_id: uuid.UUID,
    data: ProductionPlanUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    svc = PlanningService(db, user.organization_id, user.id)
    return await svc.update_plan(plan_id, data)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("planning")),
):
    svc = PlanningService(db, user.organization_id, user.id)
    await svc.delete_plan(plan_id)
