import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.purchase_order import (
    Supplier,
    PurchaseOrder,
    PurchaseOrderItem,
)
from src.schemas.purchase_order import (
    SupplierCreate,
    SupplierUpdate,
    SupplierRead,
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    PurchaseOrderRead,
)

router = APIRouter(prefix="/procurement", tags=["procurement"])


async def _generate_po_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(PurchaseOrder))
    seq = (result.scalar() or 0) + 1
    return f"PO-{seq:06d}"


# ── Suppliers ──
@router.get("/suppliers", response_model=list[SupplierRead])
async def list_suppliers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    stmt = (
        select(Supplier)
        .where(Supplier.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/suppliers", response_model=SupplierRead, status_code=status.HTTP_201_CREATED
)
async def create_supplier(
    data: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    obj = Supplier(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/suppliers/{supplier_id}", response_model=SupplierRead)
async def update_supplier(
    supplier_id: uuid.UUID,
    data: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    result = await db.execute(
        select(Supplier).where(
            Supplier.id == supplier_id,
            Supplier.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Supplier not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ── Purchase Orders ──
@router.get("/orders", response_model=list[PurchaseOrderRead])
async def list_orders(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status_filter: str = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    stmt = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.organization_id == user.organization_id)
        .order_by(PurchaseOrder.order_date.desc())
    )
    if status_filter:
        stmt = stmt.where(PurchaseOrder.status == status_filter)
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.post(
    "/orders", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED
)
async def create_order(
    data: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    po_number = await _generate_po_number(db)
    subtotal = sum(item.quantity * item.unit_price for item in data.items)

    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=data.supplier_id,
        category=data.category,
        order_date=data.order_date,
        expected_delivery=data.expected_delivery,
        currency=data.currency,
        notes=data.notes,
        subtotal=subtotal,
        tax=0.0,
        total=subtotal,
        organization_id=user.organization_id,
    )
    db.add(po)
    await db.flush()

    for item_data in data.items:
        item = PurchaseOrderItem(
            purchase_order_id=po.id,
            description=item_data.description,
            quantity=item_data.quantity,
            unit=item_data.unit,
            unit_price=item_data.unit_price,
            total_price=item_data.quantity * item_data.unit_price,
            notes=item_data.notes,
        )
        db.add(item)
    await db.flush()

    # Reload with items
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == po.id)
    )
    return result.scalar_one()


@router.put("/orders/{order_id}", response_model=PurchaseOrderRead)
async def update_order(
    order_id: uuid.UUID,
    data: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Purchase order not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj
