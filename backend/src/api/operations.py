import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
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
from src.services.operations_service import OperationsService

router = APIRouter(tags=["operations"])

# --- Checklist ---


@router.get("/checklist", response_model=list[ChecklistItemRead])
async def list_checklist(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.list_checklist(page=page, size=size)


@router.get("/checklist/{item_id}", response_model=ChecklistItemRead)
async def get_checklist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.get_checklist(item_id)


@router.post(
    "/checklist", response_model=ChecklistItemRead, status_code=status.HTTP_201_CREATED
)
async def create_checklist(
    data: ChecklistItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.create_checklist(data)


@router.put("/checklist/{item_id}", response_model=ChecklistItemRead)
async def update_checklist(
    item_id: uuid.UUID,
    data: ChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.update_checklist(item_id, data)


@router.delete("/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    await svc.delete_checklist(item_id)


# --- Logbook ---


@router.get("/logbook", response_model=list[LogbookEntryRead])
async def list_logbook(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.list_logbook(page=page, size=size)


@router.get("/logbook/{item_id}", response_model=LogbookEntryRead)
async def get_logbook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.get_logbook(item_id)


@router.post(
    "/logbook", response_model=LogbookEntryRead, status_code=status.HTTP_201_CREATED
)
async def create_logbook(
    data: LogbookEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.create_logbook(data)


@router.put("/logbook/{item_id}", response_model=LogbookEntryRead)
async def update_logbook(
    item_id: uuid.UUID,
    data: LogbookEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.update_logbook(item_id, data)


@router.delete("/logbook/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_logbook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    await svc.delete_logbook(item_id)


# --- Personnel ---


@router.get("/personnel", response_model=list[PersonnelRead])
async def list_personnel(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.list_personnel(page=page, size=size)


@router.get("/personnel/{item_id}", response_model=PersonnelRead)
async def get_personnel(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.get_personnel(item_id)


@router.post(
    "/personnel", response_model=PersonnelRead, status_code=status.HTTP_201_CREATED
)
async def create_personnel(
    data: PersonnelCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.create_personnel(data)


@router.put("/personnel/{item_id}", response_model=PersonnelRead)
async def update_personnel(
    item_id: uuid.UUID,
    data: PersonnelUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    return await svc.update_personnel(item_id, data)


@router.delete("/personnel/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_personnel(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = OperationsService(db, user.organization_id, user.id)
    await svc.delete_personnel(item_id)
