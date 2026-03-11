import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.cache import invalidate_prefix
from src.database import get_db
from src.models.auth import User
from src.models.feed import FeedConsumption, FeedPurchase
from src.schemas.feed import (
    FeedConsumptionCreate,
    FeedConsumptionRead,
    FeedConsumptionUpdate,
    FeedPurchaseCreate,
    FeedPurchaseRead,
    FeedPurchaseUpdate,
)
from src.services.tenant_service import TenantService

router = APIRouter(prefix="/feed", tags=["feed"])

# --- Purchases ---


@router.get("/purchases", response_model=list[FeedPurchaseRead])
async def list_purchases(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        TenantService.scoped_query(FeedPurchase, user.organization_id)
        .order_by(FeedPurchase.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/purchases/{item_id}", response_model=FeedPurchaseRead)
async def get_purchase(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await TenantService.get_one(
        db, FeedPurchase, item_id, user.organization_id,
        error_msg="Feed purchase not found",
    )


@router.post(
    "/purchases", response_model=FeedPurchaseRead, status_code=status.HTTP_201_CREATED
)
async def create_purchase(
    data: FeedPurchaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = FeedPurchase(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    await invalidate_prefix(f"economics:{user.organization_id}")
    return item


@router.put("/purchases/{item_id}", response_model=FeedPurchaseRead)
async def update_purchase(
    item_id: uuid.UUID,
    data: FeedPurchaseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await TenantService.update_fields(
        db, FeedPurchase, item_id, user.organization_id,
        data.model_dump(exclude_unset=True), error_msg="Feed purchase not found",
    )
    await invalidate_prefix(f"economics:{user.organization_id}")
    return item


@router.delete("/purchases/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await TenantService.soft_delete(
        db, FeedPurchase, item_id, user.organization_id,
        error_msg="Feed purchase not found",
    )
    await invalidate_prefix(f"economics:{user.organization_id}")


# --- Consumption ---


@router.get("/consumption", response_model=list[FeedConsumptionRead])
async def list_consumption(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        TenantService.scoped_query(FeedConsumption, user.organization_id)
        .order_by(FeedConsumption.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/consumption/{item_id}", response_model=FeedConsumptionRead)
async def get_consumption(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await TenantService.get_one(
        db, FeedConsumption, item_id, user.organization_id,
        error_msg="Feed consumption not found",
    )


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
    item = FeedConsumption(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    await invalidate_prefix(f"economics:{user.organization_id}")
    return item


@router.put("/consumption/{item_id}", response_model=FeedConsumptionRead)
async def update_consumption(
    item_id: uuid.UUID,
    data: FeedConsumptionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await TenantService.update_fields(
        db, FeedConsumption, item_id, user.organization_id,
        data.model_dump(exclude_unset=True), error_msg="Feed consumption not found",
    )
    await invalidate_prefix(f"economics:{user.organization_id}")
    return item


@router.delete("/consumption/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_consumption(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await TenantService.get_one(
        db, FeedConsumption, item_id, user.organization_id,
        error_msg="Feed consumption not found",
    )
    await db.delete(item)
    await invalidate_prefix(f"economics:{user.organization_id}")
