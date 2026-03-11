import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.grading import (
    GradingSessionCreate,
    GradingSessionUpdate,
    GradingSessionRead,
)
from src.services.grading_service import GradingService

router = APIRouter(prefix="/grading", tags=["grading"])


@router.get("/sessions", response_model=list[GradingSessionRead])
async def list_grading_sessions(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = GradingService(db, user.organization_id, user.id)
    return await svc.list_sessions(page=page, size=size)


@router.post(
    "/sessions", response_model=GradingSessionRead, status_code=status.HTTP_201_CREATED
)
async def create_grading_session(
    data: GradingSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = GradingService(db, user.organization_id, user.id)
    return await svc.create_session(data)


@router.get("/sessions/{session_id}", response_model=GradingSessionRead)
async def get_grading_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = GradingService(db, user.organization_id, user.id)
    return await svc.get_session(session_id)


@router.put("/sessions/{session_id}", response_model=GradingSessionRead)
async def update_grading_session(
    session_id: uuid.UUID,
    data: GradingSessionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = GradingService(db, user.organization_id, user.id)
    return await svc.update_session(session_id, data)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grading_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = GradingService(db, user.organization_id, user.id)
    await svc.delete_session(session_id)
