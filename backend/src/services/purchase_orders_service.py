"""PurchaseOrdersService — Gestión de proveedores y órdenes de compra."""

import uuid

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from src.models.purchase_order import PurchaseOrder, PurchaseOrderItem, Supplier
from src.services.base import BaseService


class PurchaseOrdersService(BaseService):
    """Operaciones CRUD tenant-scoped para proveedores y órdenes de compra."""

    # ── Suppliers ─────────────────────────────────────────────────────

    async def list_suppliers(self, *, page: int = 1, size: int = 50) -> list:
        """Listar proveedores de la organización."""
        return await self._list(Supplier, page=page, size=size)

    async def create_supplier(self, data) -> Supplier:
        """Crear un proveedor nuevo."""
        return await self._create(Supplier, data)

    async def update_supplier(self, supplier_id: uuid.UUID, data) -> Supplier:
        """Actualizar campos de un proveedor existente."""
        return await self._update(
            Supplier, supplier_id, data, error_msg="Supplier not found"
        )

    # ── Purchase Orders ───────────────────────────────────────────────

    async def _generate_po_number(self) -> str:
        """Generar número secuencial de orden de compra."""
        result = await self.db.execute(
            select(func.count()).select_from(PurchaseOrder)
        )
        seq = (result.scalar() or 0) + 1
        return f"PO-{seq:06d}"

    async def list_orders(
        self,
        *,
        page: int = 1,
        size: int = 50,
        status_filter: str | None = None,
    ) -> list:
        """Listar órdenes de compra con sus ítems, filtro opcional por estado."""
        stmt = (
            self._scoped(PurchaseOrder)
            .options(selectinload(PurchaseOrder.items))
            .order_by(PurchaseOrder.order_date.desc())
        )
        if status_filter:
            stmt = stmt.where(PurchaseOrder.status == status_filter)
        stmt = stmt.offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def create_order(self, data) -> PurchaseOrder:
        """Crear una orden de compra con sus ítems."""
        po_number = await self._generate_po_number()
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
            organization_id=self.org_id,
        )
        self.db.add(po)
        await self.db.flush()

        for item_data in data.items:
            item = PurchaseOrderItem(
                purchase_order_id=po.id,
                organization_id=self.org_id,
                description=item_data.description,
                quantity=item_data.quantity,
                unit=item_data.unit,
                unit_price=item_data.unit_price,
                total_price=item_data.quantity * item_data.unit_price,
                notes=item_data.notes,
            )
            self.db.add(item)
        await self.db.flush()

        # Recargar con ítems
        result = await self.db.execute(
            select(PurchaseOrder)
            .options(selectinload(PurchaseOrder.items))
            .where(PurchaseOrder.id == po.id)
        )
        return result.scalar_one()

    async def update_order(self, order_id: uuid.UUID, data) -> PurchaseOrder:
        """Actualizar campos de una orden de compra existente."""
        return await self._update(
            PurchaseOrder, order_id, data, error_msg="Purchase order not found"
        )
