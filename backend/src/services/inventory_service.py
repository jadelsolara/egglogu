"""InventoryService — Ubicaciones, stock, movimientos, empaque."""

import uuid

from sqlalchemy import select

from src.models.inventory import (
    EggStock,
    PackagingMaterial,
    StockMovement,
    WarehouseLocation,
)
from src.services.base import BaseService


class InventoryService(BaseService):

    # ── Ubicaciones ──────────────────────────────────────────────────

    async def list_locations(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(WarehouseLocation, page=page, size=size)

    async def create_location(self, data) -> WarehouseLocation:
        return await self._create(WarehouseLocation, data)

    async def update_location(
        self, location_id: uuid.UUID, data
    ) -> WarehouseLocation:
        return await self._update(
            WarehouseLocation, location_id, data, error_msg="Location not found"
        )

    # ── Stock ────────────────────────────────────────────────────────

    async def list_stock(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(EggStock, page=page, size=size)

    async def create_stock(self, data) -> EggStock:
        return await self._create(EggStock, data)

    async def update_stock(self, stock_id: uuid.UUID, data) -> EggStock:
        return await self._update(
            EggStock, stock_id, data, error_msg="Stock item not found"
        )

    # ── Movimientos (con lógica de negocio: actualizar stock) ────────

    async def list_movements(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(
            StockMovement, page=page, size=size, order_by=StockMovement.date.desc()
        )

    async def create_movement(self, data) -> StockMovement:
        obj = StockMovement(**data.model_dump(), organization_id=self.org_id)
        self.db.add(obj)

        if data.stock_id:
            result = await self.db.execute(
                select(EggStock).where(EggStock.id == data.stock_id)
            )
            stock = result.scalar_one_or_none()
            if stock:
                if data.movement_type in ("production_in", "return_in"):
                    stock.quantity += data.quantity
                elif data.movement_type in ("sale_out", "breakage"):
                    stock.quantity = max(0, stock.quantity - data.quantity)

        await self.db.flush()
        return obj

    # ── Material de empaque ──────────────────────────────────────────

    async def list_packaging(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(PackagingMaterial, page=page, size=size)

    async def create_packaging(self, data) -> PackagingMaterial:
        return await self._create(PackagingMaterial, data)

    async def update_packaging(self, item_id: uuid.UUID, data) -> PackagingMaterial:
        return await self._update(
            PackagingMaterial, item_id, data,
            error_msg="Packaging material not found",
        )
