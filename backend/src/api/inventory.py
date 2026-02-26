import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.inventory import (
    WarehouseLocation,
    EggStock,
    StockMovement,
    PackagingMaterial,
)
from src.schemas.inventory import (
    WarehouseLocationCreate,
    WarehouseLocationUpdate,
    WarehouseLocationRead,
    EggStockCreate,
    EggStockUpdate,
    EggStockRead,
    StockMovementCreate,
    StockMovementRead,
    PackagingMaterialCreate,
    PackagingMaterialUpdate,
    PackagingMaterialRead,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── Warehouse Locations ──
@router.get("/locations", response_model=list[WarehouseLocationRead])
async def list_locations(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    stmt = (
        select(WarehouseLocation)
        .where(WarehouseLocation.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/locations",
    response_model=WarehouseLocationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_location(
    data: WarehouseLocationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    obj = WarehouseLocation(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/locations/{location_id}", response_model=WarehouseLocationRead)
async def update_location(
    location_id: uuid.UUID,
    data: WarehouseLocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    result = await db.execute(
        select(WarehouseLocation).where(
            WarehouseLocation.id == location_id,
            WarehouseLocation.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Location not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ── Egg Stock ──
@router.get("/stock", response_model=list[EggStockRead])
async def list_stock(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    stmt = (
        select(EggStock)
        .where(EggStock.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/stock", response_model=EggStockRead, status_code=status.HTTP_201_CREATED)
async def create_stock(
    data: EggStockCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    obj = EggStock(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/stock/{stock_id}", response_model=EggStockRead)
async def update_stock(
    stock_id: uuid.UUID,
    data: EggStockUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    result = await db.execute(
        select(EggStock).where(
            EggStock.id == stock_id,
            EggStock.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Stock item not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ── Stock Movements ──
@router.get("/movements", response_model=list[StockMovementRead])
async def list_movements(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    stmt = (
        select(StockMovement)
        .where(StockMovement.organization_id == user.organization_id)
        .order_by(StockMovement.date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/movements", response_model=StockMovementRead, status_code=status.HTTP_201_CREATED
)
async def create_movement(
    data: StockMovementCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    obj = StockMovement(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    # Auto-update stock quantity based on movement
    if data.stock_id:
        stock_result = await db.execute(
            select(EggStock).where(EggStock.id == data.stock_id)
        )
        stock = stock_result.scalar_one_or_none()
        if stock:
            if data.movement_type in ("production_in", "return_in"):
                stock.quantity += data.quantity
            elif data.movement_type in ("sale_out", "breakage"):
                stock.quantity = max(0, stock.quantity - data.quantity)
    await db.flush()
    return obj


# ── Packaging Materials ──
@router.get("/packaging", response_model=list[PackagingMaterialRead])
async def list_packaging(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    stmt = (
        select(PackagingMaterial)
        .where(PackagingMaterial.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/packaging",
    response_model=PackagingMaterialRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_packaging(
    data: PackagingMaterialCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    obj = PackagingMaterial(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/packaging/{item_id}", response_model=PackagingMaterialRead)
async def update_packaging(
    item_id: uuid.UUID,
    data: PackagingMaterialUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    result = await db.execute(
        select(PackagingMaterial).where(
            PackagingMaterial.id == item_id,
            PackagingMaterial.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Packaging material not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj
