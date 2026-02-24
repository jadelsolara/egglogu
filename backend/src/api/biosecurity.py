import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.biosecurity import (
    BiosecurityProtocol,
    BiosecurityVisitor,
    BiosecurityZone,
    PestSighting,
)
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

router = APIRouter(prefix="/biosecurity", tags=["biosecurity"])


# ── Visitors ──


@router.get("/visitors", response_model=list[BiosecurityVisitorRead])
async def list_visitors(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    stmt = select(BiosecurityVisitor).where(BiosecurityVisitor.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


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
    obj = BiosecurityVisitor(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/visitors/{item_id}", response_model=BiosecurityVisitorRead)
async def update_visitor(
    item_id: uuid.UUID,
    data: BiosecurityVisitorUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(BiosecurityVisitor).where(
            BiosecurityVisitor.id == item_id,
            BiosecurityVisitor.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Visitor not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/visitors/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_visitor(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(BiosecurityVisitor).where(
            BiosecurityVisitor.id == item_id,
            BiosecurityVisitor.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Visitor not found")
    await db.delete(obj)


# ── Zones ──


@router.get("/zones", response_model=list[BiosecurityZoneRead])
async def list_zones(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    stmt = select(BiosecurityZone).where(BiosecurityZone.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/zones", response_model=BiosecurityZoneRead, status_code=status.HTTP_201_CREATED
)
async def create_zone(
    data: BiosecurityZoneCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    obj = BiosecurityZone(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/zones/{item_id}", response_model=BiosecurityZoneRead)
async def update_zone(
    item_id: uuid.UUID,
    data: BiosecurityZoneUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(BiosecurityZone).where(
            BiosecurityZone.id == item_id,
            BiosecurityZone.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Zone not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/zones/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(BiosecurityZone).where(
            BiosecurityZone.id == item_id,
            BiosecurityZone.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Zone not found")
    await db.delete(obj)


# ── Pest Sightings ──


@router.get("/pests", response_model=list[PestSightingRead])
async def list_pests(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    stmt = select(PestSighting).where(PestSighting.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/pests", response_model=PestSightingRead, status_code=status.HTTP_201_CREATED
)
async def create_pest(
    data: PestSightingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    obj = PestSighting(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/pests/{item_id}", response_model=PestSightingRead)
async def update_pest(
    item_id: uuid.UUID,
    data: PestSightingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(PestSighting).where(
            PestSighting.id == item_id,
            PestSighting.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Pest sighting not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/pests/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pest(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(PestSighting).where(
            PestSighting.id == item_id,
            PestSighting.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Pest sighting not found")
    await db.delete(obj)


# ── Protocols ──


@router.get("/protocols", response_model=list[BiosecurityProtocolRead])
async def list_protocols(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    stmt = select(BiosecurityProtocol).where(BiosecurityProtocol.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


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
    obj = BiosecurityProtocol(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/protocols/{item_id}", response_model=BiosecurityProtocolRead)
async def update_protocol(
    item_id: uuid.UUID,
    data: BiosecurityProtocolUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(BiosecurityProtocol).where(
            BiosecurityProtocol.id == item_id,
            BiosecurityProtocol.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Protocol not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


@router.delete("/protocols/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_protocol(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(BiosecurityProtocol).where(
            BiosecurityProtocol.id == item_id,
            BiosecurityProtocol.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Protocol not found")
    await db.delete(obj)
