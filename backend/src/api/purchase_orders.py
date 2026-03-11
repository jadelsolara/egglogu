import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.purchase_order import (
    SupplierCreate,
    SupplierUpdate,
    SupplierRead,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderRead,
)
from src.services.purchase_orders_service import PurchaseOrdersService

router = APIRouter(prefix="/procurement", tags=["procurement"])


# ── Suppliers ──
@router.get("/suppliers", response_model=list[SupplierRead])
async def list_suppliers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = PurchaseOrdersService(db, user.organization_id, user.id)
    return await svc.list_suppliers(page=page, size=size)


@router.post(
    "/suppliers", response_model=SupplierRead, status_code=status.HTTP_201_CREATED
)
async def create_supplier(
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = PurchaseOrdersService(db, user.organization_id, user.id)
    return await svc.create_supplier(data)


@router.put("/suppliers/{supplier_id}", response_model=SupplierRead)
async def update_supplier(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = PurchaseOrdersService(db, user.organization_id, user.id)
    return await svc.update_supplier(supplier_id, data)


# ── Purchase Orders ──
@router.get("/orders", response_model=list[PurchaseOrderRead])
async def list_orders(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status_filter: str = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = PurchaseOrdersService(db, user.organization_id, user.id)
    return await svc.list_orders(page=page, size=size, status_filter=status_filter)


@router.post(
    "/orders", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED
)
async def create_order(
    data: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = PurchaseOrdersService(db, user.organization_id, user.id)
    return await svc.create_order(data)


@router.put("/orders/{order_id}", response_model=PurchaseOrderRead)
async def update_order(
    order_id: uuid.UUID,
    data: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = PurchaseOrdersService(db, user.organization_id, user.id)
    return await svc.update_order(order_id, data)
