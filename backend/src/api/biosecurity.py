import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.biosecurity import (
    BiosecurityProtocolCreate,
    BiosecurityProtocolRead,
    BiosecurityProtocolUpdate,
    BiosecurityVisitorCreate,
    BiosecurityVisitorRead,
    BiosecurityVisitorUpdate,
    BiosecurityZoneCreate,
    BiosecurityZoneRead,
    BiosecurityZoneUpdate,
    PestSightingCreate,
    PestSightingRead,
    PestSightingUpdate,
)
from src.services.biosecurity_service import BiosecurityService

router = APIRouter(prefix="/biosecurity", tags=["biosecurity"])


# ── Visitors ──


@router.get("/visitors", response_model=list[BiosecurityVisitorRead])
async def list_visitors(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.list_visitors(page=page, size=size)


@router.post(
    "/visitors",
    response_model=BiosecurityVisitorRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_visitor(
    data: BiosecurityVisitorCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.create_visitor(data)


@router.put("/visitors/{item_id}", response_model=BiosecurityVisitorRead)
async def update_visitor(
    item_id: uuid.UUID,
    data: BiosecurityVisitorUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.update_visitor(item_id, data)


@router.delete("/visitors/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_visitor(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    await svc.delete_visitor(item_id)


# ── Zones ──


@router.get("/zones", response_model=list[BiosecurityZoneRead])
async def list_zones(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.list_zones(page=page, size=size)


@router.post(
    "/zones", response_model=BiosecurityZoneRead, status_code=status.HTTP_201_CREATED
)
async def create_zone(
    data: BiosecurityZoneCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.create_zone(data)


@router.put("/zones/{item_id}", response_model=BiosecurityZoneRead)
async def update_zone(
    item_id: uuid.UUID,
    data: BiosecurityZoneUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.update_zone(item_id, data)


@router.delete("/zones/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    await svc.delete_zone(item_id)


# ── Pest Sightings ──


@router.get("/pests", response_model=list[PestSightingRead])
async def list_pests(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.list_pests(page=page, size=size)


@router.post(
    "/pests", response_model=PestSightingRead, status_code=status.HTTP_201_CREATED
)
async def create_pest(
    data: PestSightingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.create_pest(data)


@router.put("/pests/{item_id}", response_model=PestSightingRead)
async def update_pest(
    item_id: uuid.UUID,
    data: PestSightingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.update_pest(item_id, data)


@router.delete("/pests/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pest(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    await svc.delete_pest(item_id)


# ── Protocols ──


@router.get("/protocols", response_model=list[BiosecurityProtocolRead])
async def list_protocols(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.list_protocols(page=page, size=size)


@router.post(
    "/protocols",
    response_model=BiosecurityProtocolRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_protocol(
    data: BiosecurityProtocolCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.create_protocol(data)


@router.put("/protocols/{item_id}", response_model=BiosecurityProtocolRead)
async def update_protocol(
    item_id: uuid.UUID,
    data: BiosecurityProtocolUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    return await svc.update_protocol(item_id, data)


@router.delete("/protocols/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_protocol(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    svc = BiosecurityService(db, user.organization_id, user.id)
    await svc.delete_protocol(item_id)
