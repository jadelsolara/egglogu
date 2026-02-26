import uuid
from datetime import date
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Warehouse Location ──
class WarehouseLocationCreate(BaseModel):
    name: str
    code: str
    location_type: str = "storage"
    capacity_units: Optional[int] = None
    temp_controlled: bool = False
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    notes: Optional[str] = None


class WarehouseLocationUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    location_type: Optional[str] = None
    capacity_units: Optional[int] = None
    temp_controlled: Optional[bool] = None
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class WarehouseLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    code: str
    location_type: str
    capacity_units: Optional[int]
    temp_controlled: bool
    temp_min_c: Optional[float]
    temp_max_c: Optional[float]
    is_active: bool
    notes: Optional[str]


# ── Egg Stock ──
class EggStockCreate(BaseModel):
    location_id: Optional[uuid.UUID] = None
    flock_id: Optional[uuid.UUID] = None
    date: date
    egg_size: str
    egg_type: Optional[str] = None
    quality_grade: Optional[str] = None
    quantity: int = 0
    packaging: Optional[str] = None
    batch_code: Optional[str] = None
    best_before: Optional[date] = None
    unit_cost: Optional[float] = None
    notes: Optional[str] = None


class EggStockUpdate(BaseModel):
    location_id: Optional[uuid.UUID] = None
    quantity: Optional[int] = None
    quality_grade: Optional[str] = None
    packaging: Optional[str] = None
    best_before: Optional[date] = None
    unit_cost: Optional[float] = None
    notes: Optional[str] = None


class EggStockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    location_id: Optional[uuid.UUID]
    flock_id: Optional[uuid.UUID]
    date: date
    egg_size: str
    egg_type: Optional[str]
    quality_grade: Optional[str]
    quantity: int
    packaging: Optional[str]
    batch_code: Optional[str]
    best_before: Optional[date]
    unit_cost: Optional[float]
    notes: Optional[str]


# ── Stock Movement ──
class StockMovementCreate(BaseModel):
    stock_id: Optional[uuid.UUID] = None
    movement_type: str
    quantity: int
    date: date
    reference: Optional[str] = None
    from_location_id: Optional[uuid.UUID] = None
    to_location_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    stock_id: Optional[uuid.UUID]
    movement_type: str
    quantity: int
    date: date
    reference: Optional[str]
    from_location_id: Optional[uuid.UUID]
    to_location_id: Optional[uuid.UUID]
    notes: Optional[str]


# ── Packaging Material ──
class PackagingMaterialCreate(BaseModel):
    name: str
    packaging_type: str
    quantity_on_hand: int = 0
    reorder_level: int = 0
    unit_cost: Optional[float] = None
    supplier: Optional[str] = None
    notes: Optional[str] = None


class PackagingMaterialUpdate(BaseModel):
    name: Optional[str] = None
    quantity_on_hand: Optional[int] = None
    reorder_level: Optional[int] = None
    unit_cost: Optional[float] = None
    supplier: Optional[str] = None
    notes: Optional[str] = None


class PackagingMaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    packaging_type: str
    quantity_on_hand: int
    reorder_level: int
    unit_cost: Optional[float]
    supplier: Optional[str]
    notes: Optional[str]
