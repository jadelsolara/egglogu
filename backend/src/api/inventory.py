import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.inventory import (
    EggStockCreate,
    EggStockRead,
    EggStockUpdate,
    PackagingMaterialCreate,
    PackagingMaterialRead,
    PackagingMaterialUpdate,
    StockMovementCreate,
    StockMovementRead,
    WarehouseLocationCreate,
    WarehouseLocationRead,
    WarehouseLocationUpdate,
)
from src.services.inventory_service import InventoryService

router = APIRouter(prefix="/inventory", tags=["inventory"])


# ── Warehouse Locations ──
@router.get("/locations", response_model=list[WarehouseLocationRead])
async def list_locations(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.list_locations(page=page, size=size)


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
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.create_location(data)


@router.put("/locations/{location_id}", response_model=WarehouseLocationRead)
async def update_location(
    location_id: uuid.UUID,
    data: WarehouseLocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.update_location(location_id, data)


# ── Egg Stock ──
@router.get("/stock", response_model=list[EggStockRead])
async def list_stock(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.list_stock(page=page, size=size)


@router.post("/stock", response_model=EggStockRead, status_code=status.HTTP_201_CREATED)
async def create_stock(
    data: EggStockCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.create_stock(data)


@router.put("/stock/{stock_id}", response_model=EggStockRead)
async def update_stock(
    stock_id: uuid.UUID,
    data: EggStockUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.update_stock(stock_id, data)


# ── Stock Movements ──
@router.get("/movements", response_model=list[StockMovementRead])
async def list_movements(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.list_movements(page=page, size=size)


@router.post(
    "/movements", response_model=StockMovementRead, status_code=status.HTTP_201_CREATED
)
async def create_movement(
    data: StockMovementCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.create_movement(data)


# ── Packaging Materials ──
@router.get("/packaging", response_model=list[PackagingMaterialRead])
async def list_packaging(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.list_packaging(page=page, size=size)


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
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.create_packaging(data)


@router.put("/packaging/{item_id}", response_model=PackagingMaterialRead)
async def update_packaging(
    item_id: uuid.UUID,
    data: PackagingMaterialUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("inventory")),
):
    svc = InventoryService(db, user.organization_id, user.id)
    return await svc.update_packaging(item_id, data)
