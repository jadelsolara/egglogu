import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    String, Float, Integer, Date, Enum,
    ForeignKey, Text, Boolean
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class StockMovementType(str, enum.Enum):
    production_in = "production_in"
    sale_out = "sale_out"
    breakage = "breakage"
    adjustment = "adjustment"
    transfer = "transfer"
    return_in = "return_in"


class PackagingType(str, enum.Enum):
    tray_30 = "tray_30"
    carton_6 = "carton_6"
    carton_10 = "carton_10"
    carton_12 = "carton_12"
    bulk_case = "bulk_case"
    pallet = "pallet"


class WarehouseLocation(TimestampMixin, TenantMixin, Base):
    __tablename__ = "warehouse_locations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(50))
    location_type: Mapped[str] = mapped_column(String(50), default="storage")
    capacity_units: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    temp_controlled: Mapped[bool] = mapped_column(Boolean, default=False)
    temp_min_c: Mapped[Optional[float]] = mapped_column(Float, default=None)
    temp_max_c: Mapped[Optional[float]] = mapped_column(Float, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    stock_items: Mapped[list["EggStock"]] = relationship(back_populates="location")


class EggStock(TimestampMixin, TenantMixin, Base):
    __tablename__ = "egg_stock"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouse_locations.id", ondelete="SET NULL"),
        index=True, default=None
    )
    flock_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("flocks.id", ondelete="SET NULL"), index=True, default=None
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    egg_size: Mapped[str] = mapped_column(String(20))
    egg_type: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    quality_grade: Mapped[Optional[str]] = mapped_column(String(10), default=None)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    packaging: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    batch_code: Mapped[Optional[str]] = mapped_column(String(100), index=True, default=None)
    best_before: Mapped[Optional[date]] = mapped_column(Date, default=None)
    unit_cost: Mapped[Optional[float]] = mapped_column(Float, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    location: Mapped[Optional["WarehouseLocation"]] = relationship(
        back_populates="stock_items"
    )


class StockMovement(TimestampMixin, TenantMixin, Base):
    __tablename__ = "stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    stock_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("egg_stock.id", ondelete="SET NULL"), index=True, default=None
    )
    movement_type: Mapped[StockMovementType] = mapped_column(
        Enum(StockMovementType)
    )
    quantity: Mapped[int] = mapped_column(Integer)
    date: Mapped[date] = mapped_column(Date, index=True)
    reference: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    from_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouse_locations.id", ondelete="SET NULL"), default=None
    )
    to_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouse_locations.id", ondelete="SET NULL"), default=None
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class PackagingMaterial(TimestampMixin, TenantMixin, Base):
    __tablename__ = "packaging_materials"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    packaging_type: Mapped[PackagingType] = mapped_column(Enum(PackagingType))
    quantity_on_hand: Mapped[int] = mapped_column(Integer, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, default=0)
    unit_cost: Mapped[Optional[float]] = mapped_column(Float, default=None)
    supplier: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
