import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.animal_welfare import (
    WelfareAssessmentCreate,
    WelfareAssessmentRead,
    WelfareAssessmentUpdate,
    WelfareStats,
)
from src.services.animal_welfare_service import AnimalWelfareService

router = APIRouter(tags=["animal_welfare"])


@router.get("/welfare", response_model=list[WelfareAssessmentRead])
async def list_assessments(
    flock_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = AnimalWelfareService(db, user.organization_id, user.id)
    return await svc.list_assessments(flock_id=flock_id, page=page, size=size)


@router.get("/welfare/stats", response_model=WelfareStats)
async def welfare_stats(
    flock_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = AnimalWelfareService(db, user.organization_id, user.id)
    return await svc.get_stats(flock_id=flock_id)


@router.get("/welfare/{item_id}", response_model=WelfareAssessmentRead)
async def get_assessment(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = AnimalWelfareService(db, user.organization_id, user.id)
    return await svc.get_assessment(item_id)


@router.post(
    "/welfare",
    response_model=WelfareAssessmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_assessment(
    data: WelfareAssessmentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = AnimalWelfareService(db, user.organization_id, user.id)
    return await svc.create_assessment(data)


@router.put("/welfare/{item_id}", response_model=WelfareAssessmentRead)
async def update_assessment(
    item_id: uuid.UUID,
    data: WelfareAssessmentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = AnimalWelfareService(db, user.organization_id, user.id)
    return await svc.update_assessment(item_id, data)


@router.delete("/welfare/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assessment(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = AnimalWelfareService(db, user.organization_id, user.id)
    await svc.delete_assessment(item_id)
