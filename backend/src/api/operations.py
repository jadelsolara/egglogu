import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.operations import ChecklistItem, LogbookEntry, Personnel
from src.schemas.operations import (
    ChecklistItemCreate,
    ChecklistItemRead,
    ChecklistItemUpdate,
    LogbookEntryCreate,
    LogbookEntryRead,
    LogbookEntryUpdate,
    PersonnelCreate,
    PersonnelRead,
    PersonnelUpdate,
)

router = APIRouter(tags=["operations"])

# --- Checklist ---


@router.get("/checklist", response_model=list[ChecklistItemRead])
async def list_checklist(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(ChecklistItem)
        .where(ChecklistItem.organization_id == user.organization_id)
        .order_by(ChecklistItem.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/checklist/{item_id}", response_model=ChecklistItemRead)
async def get_checklist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id,
            ChecklistItem.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Checklist item not found")
    return item


@router.post(
    "/checklist", response_model=ChecklistItemRead, status_code=status.HTTP_201_CREATED
)
async def create_checklist(
    data: ChecklistItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = ChecklistItem(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/checklist/{item_id}", response_model=ChecklistItemRead)
async def update_checklist(
    item_id: uuid.UUID,
    data: ChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id,
            ChecklistItem.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Checklist item not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id,
            ChecklistItem.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Checklist item not found")
    await db.delete(item)


# --- Logbook ---


@router.get("/logbook", response_model=list[LogbookEntryRead])
async def list_logbook(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(LogbookEntry)
        .where(LogbookEntry.organization_id == user.organization_id)
        .order_by(LogbookEntry.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/logbook/{item_id}", response_model=LogbookEntryRead)
async def get_logbook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LogbookEntry).where(
            LogbookEntry.id == item_id,
            LogbookEntry.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Logbook entry not found")
    return item


@router.post(
    "/logbook", response_model=LogbookEntryRead, status_code=status.HTTP_201_CREATED
)
async def create_logbook(
    data: LogbookEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = LogbookEntry(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/logbook/{item_id}", response_model=LogbookEntryRead)
async def update_logbook(
    item_id: uuid.UUID,
    data: LogbookEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LogbookEntry).where(
            LogbookEntry.id == item_id,
            LogbookEntry.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Logbook entry not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/logbook/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_logbook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LogbookEntry).where(
            LogbookEntry.id == item_id,
            LogbookEntry.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Logbook entry not found")
    await db.delete(item)


# --- Personnel ---


@router.get("/personnel", response_model=list[PersonnelRead])
async def list_personnel(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Personnel)
        .where(Personnel.organization_id == user.organization_id)
        .order_by(Personnel.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/personnel/{item_id}", response_model=PersonnelRead)
async def get_personnel(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Personnel).where(
            Personnel.id == item_id, Personnel.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Personnel not found")
    return item


@router.post(
    "/personnel", response_model=PersonnelRead, status_code=status.HTTP_201_CREATED
)
async def create_personnel(
    data: PersonnelCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Personnel(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/personnel/{item_id}", response_model=PersonnelRead)
async def update_personnel(
    item_id: uuid.UUID,
    data: PersonnelUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Personnel).where(
            Personnel.id == item_id, Personnel.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Personnel not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/personnel/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_personnel(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Personnel).where(
            Personnel.id == item_id, Personnel.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Personnel not found")
    await db.delete(item)
