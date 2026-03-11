import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    String,
    Float,
    Integer,
    Date,
    Enum,
    ForeignKey,
    Text,
    Boolean,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class CostCenterType(str, enum.Enum):
    farm = "farm"
    flock = "flock"
    herd = "herd"  # PigLogu / CowLogu
    field = "field"  # CropLogu
    warehouse = "warehouse"
    transport = "transport"
    processing = "processing"  # Slaughter, packing plant, etc.
    admin = "admin"
    custom = "custom"


class AllocationMethod(str, enum.Enum):
    direct = "direct"  # 100% to one center
    proportional_units = (
        "proportional_units"  # Split by unit count (hens, pigs, cows, hectares)
    )
    proportional_production = "proportional_production"  # Split by output
    proportional_revenue = "proportional_revenue"  # Split by revenue
    equal_split = "equal_split"  # Split equally
    manual = "manual"  # User-defined %
    # Legacy alias — DB may still have this value from existing EGGlogU data
    proportional_birds = "proportional_birds"


class CostCategory(str, enum.Enum):
    # ── Shared across all verticals ──
    feed = "feed"
    medication = "medication"
    labor = "labor"
    energy = "energy"
    water = "water"
    packaging = "packaging"
    transport = "transport"
    maintenance = "maintenance"
    depreciation = "depreciation"
    insurance = "insurance"
    veterinary = "veterinary"
    cleaning = "cleaning"
    # ── Poultry-specific ──
    pullet_amortization = "pullet_amortization"
    # ── Swine-specific ──
    piglet_purchase = "piglet_purchase"
    slaughter = "slaughter"
    # ── Cattle-specific ──
    calf_purchase = "calf_purchase"
    milking_supplies = "milking_supplies"
    # ── Crops-specific ──
    seed = "seed"
    fertilizer = "fertilizer"
    pesticide = "pesticide"
    irrigation = "irrigation"
    land_lease = "land_lease"
    # ── Catch-all ──
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
        back_populates="cost_center", foreign_keys="CostAllocation.cost_center_id"
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
        back_populates="allocations", foreign_keys=[cost_center_id]
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
    revenue_breakdown: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    # ── Generic production metrics (work for any vertical) ──
    units_produced: Mapped[Optional[int]] = mapped_column(
        "eggs_produced",
        Integer,
        default=None,  # keep DB column for backward compat
    )
    units_sold: Mapped[Optional[int]] = mapped_column(
        "eggs_sold", Integer, default=None
    )
    cost_per_unit: Mapped[Optional[float]] = mapped_column(
        "cost_per_egg", Float, default=None
    )
    cost_per_standard_unit: Mapped[Optional[float]] = mapped_column(
        "cost_per_dozen",
        Float,
        default=None,  # dozen for eggs, kg for meat, liter for milk
    )
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
