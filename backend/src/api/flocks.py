import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.flock import Flock
from src.schemas.flock import FlockCreate, FlockRead, FlockUpdate

router = APIRouter(prefix="/flocks", tags=["flocks"])


@router.get("/", response_model=list[FlockRead])
async def list_flocks(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Flock).where(Flock.organization_id == user.organization_id))
    return result.scalars().all()


@router.get("/{flock_id}", response_model=FlockRead)
async def get_flock(flock_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Flock).where(Flock.id == flock_id, Flock.organization_id == user.organization_id)
    )
    flock = result.scalar_one_or_none()
    if not flock:
        raise NotFoundError("Flock not found")
    return flock


@router.post("/", response_model=FlockRead, status_code=status.HTTP_201_CREATED)
async def create_flock(data: FlockCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    flock = Flock(**data.model_dump(), organization_id=user.organization_id)
    db.add(flock)
    await db.flush()
    return flock


@router.put("/{flock_id}", response_model=FlockRead)
async def update_flock(flock_id: uuid.UUID, data: FlockUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Flock).where(Flock.id == flock_id, Flock.organization_id == user.organization_id)
    )
    flock = result.scalar_one_or_none()
    if not flock:
        raise NotFoundError("Flock not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(flock, key, value)
    await db.flush()
    return flock


@router.delete("/{flock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flock(flock_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Flock).where(Flock.id == flock_id, Flock.organization_id == user.organization_id)
    )
    flock = result.scalar_one_or_none()
    if not flock:
        raise NotFoundError("Flock not found")
    await db.delete(flock)
