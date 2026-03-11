import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.models.flock import Flock
from src.schemas.flock import FlockCreate, FlockRead, FlockUpdate
from src.services.tenant_service import TenantService

router = APIRouter(prefix="/flocks", tags=["flocks"])


@router.get("/", response_model=list[FlockRead])
async def list_flocks(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        TenantService.scoped_query(Flock, user.organization_id)
        .order_by(Flock.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{flock_id}", response_model=FlockRead)
async def get_flock(
    flock_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await TenantService.get_one(
        db, Flock, flock_id, user.organization_id, error_msg="Flock not found"
    )


@router.post("/", response_model=FlockRead, status_code=status.HTTP_201_CREATED)
async def create_flock(
    data: FlockCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    flock = Flock(**data.model_dump(), organization_id=user.organization_id)
    db.add(flock)
    await db.flush()
    return flock


@router.put("/{flock_id}", response_model=FlockRead)
async def update_flock(
    flock_id: uuid.UUID,
    data: FlockUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await TenantService.update_fields(
        db, Flock, flock_id, user.organization_id,
        data.model_dump(exclude_unset=True), error_msg="Flock not found",
    )


@router.delete("/{flock_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flock(
    flock_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    flock = await TenantService.get_one(
        db, Flock, flock_id, user.organization_id, error_msg="Flock not found"
    )
    await db.delete(flock)
