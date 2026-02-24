import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    String, Float, Integer, Date, Enum,
    ForeignKey, Text, Boolean, JSON
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class CostCenterType(str, enum.Enum):
    farm = "farm"
    flock = "flock"
    warehouse = "warehouse"
    transport = "transport"
    admin = "admin"
    custom = "custom"


class AllocationMethod(str, enum.Enum):
    direct = "direct"                # 100% to one center
    proportional_birds = "proportional_birds"  # Split by hen count
    proportional_production = "proportional_production"  # Split by egg output
    equal_split = "equal_split"      # Split equally
    manual = "manual"                # User-defined %


class CostCategory(str, enum.Enum):
    feed = "feed"
    medication = "medication"
    labor = "labor"
    energy = "energy"
    water = "water"
    packaging = "packaging"
    transport = "transport"
    maintenance = "maintenance"
    depreciation = "depreciation"
    pullet_amortization = "pullet_amortization"
    insurance = "insurance"
    veterinary = "veterinary"
    cleaning = "cleaning"
    other = "other"


class CostCenter(TimestampMixin, TenantMixin, Base):
    __tablename__ = "cost_centers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(50), index=True)
    center_type: Mapped[CostCenterType] = mapped_column(
        Enum(CostCenterType), default=CostCenterType.flock
    )
    farm_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("farms.id", ondelete="SET NULL"), index=True, default=None
    )
    flock_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("flocks.id", ondelete="SET NULL"), index=True, default=None
    )
    parent_center_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="SET NULL"), default=None
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    budget_monthly: Mapped[Optional[float]] = mapped_column(Float, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    allocations: Mapped[list["CostAllocation"]] = relationship(
        back_populates="cost_center",
        foreign_keys="CostAllocation.cost_center_id"
    )


class CostAllocation(TimestampMixin, TenantMixin, Base):
    __tablename__ = "cost_allocations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cost_center_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[CostCategory] = mapped_column(Enum(CostCategory))
    description: Mapped[str] = mapped_column(String(300))
    amount: Mapped[float] = mapped_column(Float)
    allocation_method: Mapped[AllocationMethod] = mapped_column(
        Enum(AllocationMethod), default=AllocationMethod.direct
    )
    allocation_pct: Mapped[float] = mapped_column(Float, default=100.0)
    source_expense_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("expenses.id", ondelete="SET NULL"), default=None
    )
    source_po_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="SET NULL"), default=None
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    cost_center: Mapped["CostCenter"] = relationship(
        back_populates="allocations",
        foreign_keys=[cost_center_id]
    )


class ProfitLossSnapshot(TimestampMixin, TenantMixin, Base):
    __tablename__ = "profit_loss_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    cost_center_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cost_centers.id", ondelete="CASCADE"), index=True
    )
    period_start: Mapped[date] = mapped_column(Date, index=True)
    period_end: Mapped[date] = mapped_column(Date)
    total_revenue: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    gross_profit: Mapped[float] = mapped_column(Float, default=0.0)
    margin_pct: Mapped[float] = mapped_column(Float, default=0.0)
    # Breakdown by category (JSON for flexibility)
    cost_breakdown: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    revenue_breakdown: Mapped[Optional[dict]] = mapped_column(
        JSON, default=None
    )
    eggs_produced: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    eggs_sold: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    cost_per_egg: Mapped[Optional[float]] = mapped_column(Float, default=None)
    cost_per_dozen: Mapped[Optional[float]] = mapped_column(Float, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
