import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.feed import FeedConsumption, FeedPurchase
from src.schemas.feed import (
    FeedConsumptionCreate, FeedConsumptionRead, FeedConsumptionUpdate,
    FeedPurchaseCreate, FeedPurchaseRead, FeedPurchaseUpdate,
)

router = APIRouter(prefix="/feed", tags=["feed"])

# --- Purchases ---

@router.get("/purchases", response_model=list[FeedPurchaseRead])
async def list_purchases(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedPurchase).where(FeedPurchase.organization_id == user.organization_id))
    return result.scalars().all()


@router.get("/purchases/{item_id}", response_model=FeedPurchaseRead)
async def get_purchase(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedPurchase).where(FeedPurchase.id == item_id, FeedPurchase.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Feed purchase not found")
    return item


@router.post("/purchases", response_model=FeedPurchaseRead, status_code=status.HTTP_201_CREATED)
async def create_purchase(data: FeedPurchaseCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = FeedPurchase(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/purchases/{item_id}", response_model=FeedPurchaseRead)
async def update_purchase(item_id: uuid.UUID, data: FeedPurchaseUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedPurchase).where(FeedPurchase.id == item_id, FeedPurchase.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Feed purchase not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/purchases/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedPurchase).where(FeedPurchase.id == item_id, FeedPurchase.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Feed purchase not found")
    await db.delete(item)

# --- Consumption ---

@router.get("/consumption", response_model=list[FeedConsumptionRead])
async def list_consumption(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedConsumption).where(FeedConsumption.organization_id == user.organization_id))
    return result.scalars().all()


@router.get("/consumption/{item_id}", response_model=FeedConsumptionRead)
async def get_consumption(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedConsumption).where(FeedConsumption.id == item_id, FeedConsumption.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Feed consumption not found")
    return item


@router.post("/consumption", response_model=FeedConsumptionRead, status_code=status.HTTP_201_CREATED)
async def create_consumption(data: FeedConsumptionCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = FeedConsumption(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/consumption/{item_id}", response_model=FeedConsumptionRead)
async def update_consumption(item_id: uuid.UUID, data: FeedConsumptionUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedConsumption).where(FeedConsumption.id == item_id, FeedConsumption.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Feed consumption not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/consumption/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_consumption(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(FeedConsumption).where(FeedConsumption.id == item_id, FeedConsumption.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Feed consumption not found")
    await db.delete(item)
