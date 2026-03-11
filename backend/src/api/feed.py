import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.feed import (
    FeedConsumptionCreate,
    FeedConsumptionRead,
    FeedConsumptionUpdate,
    FeedPurchaseCreate,
    FeedPurchaseRead,
    FeedPurchaseUpdate,
)
from src.services.feed_service import FeedService

router = APIRouter(prefix="/feed", tags=["feed"])

# --- Purchases ---


@router.get("/purchases", response_model=list[FeedPurchaseRead])
async def list_purchases(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.list_purchases(page=page, size=size)


@router.get("/purchases/{item_id}", response_model=FeedPurchaseRead)
async def get_purchase(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.get_purchase(item_id)


@router.post(
    "/purchases", response_model=FeedPurchaseRead, status_code=status.HTTP_201_CREATED
)
async def create_purchase(
    data: FeedPurchaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.create_purchase(data)


@router.put("/purchases/{item_id}", response_model=FeedPurchaseRead)
async def update_purchase(
    item_id: uuid.UUID,
    data: FeedPurchaseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.update_purchase(item_id, data)


@router.delete("/purchases/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    await svc.delete_purchase(item_id)


# --- Consumption ---


@router.get("/consumption", response_model=list[FeedConsumptionRead])
async def list_consumption(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.list_consumption(page=page, size=size)


@router.get("/consumption/{item_id}", response_model=FeedConsumptionRead)
async def get_consumption(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.get_consumption(item_id)


@router.post(
    "/consumption",
    response_model=FeedConsumptionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_consumption(
    data: FeedConsumptionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.create_consumption(data)


@router.put("/consumption/{item_id}", response_model=FeedConsumptionRead)
async def update_consumption(
    item_id: uuid.UUID,
    data: FeedConsumptionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    return await svc.update_consumption(item_id, data)


@router.delete("/consumption/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_consumption(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = FeedService(db, user.organization_id, user.id)
    await svc.delete_consumption(item_id)
