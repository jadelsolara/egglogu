import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.flock import FlockCreate, FlockRead, FlockUpdate
from src.services.flock_service import FlockService

router = APIRouter(prefix="/flocks", tags=["flocks"])


@router.get("/", response_model=list[FlockRead])
async def list_flocks(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FlockService(db, user.organization_id, user.id)
    return await svc.list_flocks(page=page, size=size)


@router.get("/{flock_id}", response_model=FlockRead)
async def get_flock(
    flock_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FlockService(db, user.organization_id, user.id)
    return await svc.get_flock(flock_id)


@router.post("/", response_model=FlockRead, status_code=status.HTTP_201_CREATED)
async def create_flock(
    data: FlockCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FlockService(db, user.organization_id, user.id)
    return await svc.create_flock(data)


@router.put("/{flock_id}", response_model=FlockRead)
async def update_flock(
    flock_id: uuid.UUID,
    data: FlockUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FlockService(db, user.organization_id, user.id)
    return await svc.update_flock(flock_id, data)


@router.delete("/{flock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flock(
    flock_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FlockService(db, user.organization_id, user.id)
    await svc.delete_flock(flock_id)
