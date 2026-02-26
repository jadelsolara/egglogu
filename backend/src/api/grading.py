import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.grading import GradingSession
from src.schemas.grading import (
    GradingSessionCreate,
    GradingSessionUpdate,
    GradingSessionRead,
)

router = APIRouter(prefix="/grading", tags=["grading"])


@router.get("/sessions", response_model=list[GradingSessionRead])
async def list_grading_sessions(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    stmt = (
        select(GradingSession)
        .where(GradingSession.organization_id == user.organization_id)
        .order_by(GradingSession.date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/sessions", response_model=GradingSessionRead, status_code=status.HTTP_201_CREATED
)
async def create_grading_session(
    data: GradingSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    obj = GradingSession(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.get("/sessions/{session_id}", response_model=GradingSessionRead)
async def get_grading_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    result = await db.execute(
        select(GradingSession).where(
            GradingSession.id == session_id,
            GradingSession.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Grading session not found")
    return obj


@router.put("/sessions/{session_id}", response_model=GradingSessionRead)
async def update_grading_session(
    session_id: uuid.UUID,
    data: GradingSessionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    result = await db.execute(
        select(GradingSession).where(
            GradingSession.id == session_id,
            GradingSession.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Grading session not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grading_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    result = await db.execute(
        select(GradingSession).where(
            GradingSession.id == session_id,
            GradingSession.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Grading session not found")
    await db.delete(obj)
