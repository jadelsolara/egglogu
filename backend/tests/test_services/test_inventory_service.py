"""Tests para InventoryService — Ubicaciones, stock, movimientos, empaque."""

import uuid
from datetime import date

import pytest

from src.schemas.inventory import (
    EggStockCreate,
    EggStockUpdate,
    PackagingMaterialCreate,
    StockMovementCreate,
    WarehouseLocationCreate,
    WarehouseLocationUpdate,
)
from src.services.inventory_service import InventoryService

pytestmark = pytest.mark.asyncio


async def test_create_location(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    data = WarehouseLocationCreate(name="Bodega Principal", code="BOD-001")
    location = await svc.create_location(data)

    assert location.name == "Bodega Principal"
    assert location.code == "BOD-001"
    assert location.organization_id == user.organization_id


async def test_list_locations(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    await svc.create_location(WarehouseLocationCreate(name="Bodega A", code="A"))
    await svc.create_location(WarehouseLocationCreate(name="Bodega B", code="B"))

    locations = await svc.list_locations()
    assert len(locations) == 2


async def test_update_location(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    location = await svc.create_location(WarehouseLocationCreate(
        name="Vieja", code="V-001",
    ))
    updated = await svc.update_location(
        location.id, WarehouseLocationUpdate(name="Nueva")
    )
    assert updated.name == "Nueva"


async def test_create_stock(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    data = EggStockCreate(
        date=date(2025, 7, 1),
        egg_size="large",
        quantity=5000,
    )
    stock = await svc.create_stock(data)
    assert stock.egg_size == "large"
    assert stock.quantity == 5000


async def test_update_stock(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    stock = await svc.create_stock(EggStockCreate(
        date=date(2025, 7, 1), egg_size="medium", quantity=3000,
    ))
    updated = await svc.update_stock(stock.id, EggStockUpdate(quantity=2800))
    assert updated.quantity == 2800


async def test_create_movement_production_in(db_session, authenticated_user):
    """Movimiento production_in incrementa el stock."""
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    stock = await svc.create_stock(EggStockCreate(
        date=date(2025, 7, 1), egg_size="large", quantity=1000,
    ))

    movement = await svc.create_movement(StockMovementCreate(
        stock_id=stock.id,
        movement_type="production_in",
        quantity=500,
        date=date(2025, 7, 2),
    ))

    assert movement.movement_type == "production_in"
    assert movement.quantity == 500
    # Stock debe haber incrementado
    await db_session.refresh(stock)
    assert stock.quantity == 1500


async def test_create_movement_sale_out(db_session, authenticated_user):
    """Movimiento sale_out decrementa el stock (mínimo 0)."""
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    stock = await svc.create_stock(EggStockCreate(
        date=date(2025, 7, 1), egg_size="medium", quantity=200,
    ))

    await svc.create_movement(StockMovementCreate(
        stock_id=stock.id,
        movement_type="sale_out",
        quantity=150,
        date=date(2025, 7, 2),
    ))

    await db_session.refresh(stock)
    assert stock.quantity == 50


async def test_create_movement_no_negative_stock(db_session, authenticated_user):
    """El stock nunca baja de 0."""
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    stock = await svc.create_stock(EggStockCreate(
        date=date(2025, 7, 1), egg_size="small", quantity=10,
    ))

    await svc.create_movement(StockMovementCreate(
        stock_id=stock.id,
        movement_type="breakage",
        quantity=100,
        date=date(2025, 7, 2),
    ))

    await db_session.refresh(stock)
    assert stock.quantity == 0


async def test_create_packaging(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    data = PackagingMaterialCreate(
        name="Caja 30 huevos",
        packaging_type="box_30",
        quantity_on_hand=500,
        reorder_level=100,
    )
    material = await svc.create_packaging(data)

    assert material.name == "Caja 30 huevos"
    assert material.quantity_on_hand == 500


async def test_list_movements(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = InventoryService(db_session, user.organization_id, user.id)

    await svc.create_movement(StockMovementCreate(
        movement_type="production_in", quantity=100, date=date(2025, 7, 1),
    ))
    await svc.create_movement(StockMovementCreate(
        movement_type="sale_out", quantity=50, date=date(2025, 7, 2),
    ))

    movements = await svc.list_movements()
    assert len(movements) == 2
