import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.animal_welfare import WelfareAssessment
from src.schemas.animal_welfare import (
    WelfareAssessmentCreate,
    WelfareAssessmentRead,
    WelfareAssessmentUpdate,
    WelfareStats,
)

router = APIRouter(tags=["animal_welfare"])


@router.get("/welfare", response_model=list[WelfareAssessmentRead])
async def list_assessments(
    flock_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(WelfareAssessment)
        .where(WelfareAssessment.organization_id == user.organization_id)
        .order_by(WelfareAssessment.date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    if flock_id:
        stmt = stmt.where(WelfareAssessment.flock_id == flock_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/welfare/stats", response_model=WelfareStats)
async def welfare_stats(
    flock_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    base = select(WelfareAssessment).where(
        WelfareAssessment.organization_id == user.organization_id
    )
    if flock_id:
        base = base.where(WelfareAssessment.flock_id == flock_id)

    stmt = select(
        func.count(WelfareAssessment.id).label("total"),
        func.avg(WelfareAssessment.overall_score).label("avg_overall"),
        func.avg(WelfareAssessment.plumage_score).label("avg_plumage"),
        func.avg(WelfareAssessment.mobility_score).label("avg_mobility"),
        func.avg(WelfareAssessment.behavior_score).label("avg_behavior"),
        func.avg(
            case(
                (WelfareAssessment.feather_pecking_observed.is_(True), 1),
                else_=0,
            )
        ).label("pecking_rate"),
        func.max(WelfareAssessment.date).label("latest"),
    ).where(WelfareAssessment.organization_id == user.organization_id)
    if flock_id:
        stmt = stmt.where(WelfareAssessment.flock_id == flock_id)

    result = await db.execute(stmt)
    row = result.one()
    return WelfareStats(
        total_assessments=row.total or 0,
        avg_overall_score=round(row.avg_overall, 2) if row.avg_overall else None,
        avg_plumage=round(row.avg_plumage, 2) if row.avg_plumage else None,
        avg_mobility=round(row.avg_mobility, 2) if row.avg_mobility else None,
        avg_behavior=round(row.avg_behavior, 2) if row.avg_behavior else None,
        feather_pecking_rate=round(row.pecking_rate, 4) if row.pecking_rate else None,
        latest_date=row.latest,
    )


@router.get("/welfare/{item_id}", response_model=WelfareAssessmentRead)
async def get_assessment(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WelfareAssessment).where(
            WelfareAssessment.id == item_id,
            WelfareAssessment.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Welfare assessment not found")
    return item


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
    item = WelfareAssessment(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/welfare/{item_id}", response_model=WelfareAssessmentRead)
async def update_assessment(
    item_id: uuid.UUID,
    data: WelfareAssessmentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WelfareAssessment).where(
            WelfareAssessment.id == item_id,
            WelfareAssessment.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Welfare assessment not found")
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(item, key, value)
    # Recompute overall if any score changed
    scores = [item.plumage_score, item.mobility_score, item.behavior_score]
    if all(s is not None for s in scores):
        item.overall_score = round(sum(scores) / 3, 2)
    await db.flush()
    return item


@router.delete("/welfare/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assessment(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WelfareAssessment).where(
            WelfareAssessment.id == item_id,
            WelfareAssessment.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Welfare assessment not found")
    await db.delete(item)
