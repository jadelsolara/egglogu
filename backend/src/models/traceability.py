"""
Traceability — Core Product Batch Tracking (FarmLogU Platform)

Generic batch/lot model that works for any agricultural product:
- Eggs (EGGlogU): batch of eggs from a flock, graded & packed
- Pork (PigLogu): batch of cuts from a slaughter lot
- Milk (CowLogu): batch of milk from a milking session
- Crops (CropLogu): harvest lot from a field

Each batch gets a unique code + QR for end-to-end traceability
from origin (farm/flock/field) → processing → client delivery.
"""

import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, Enum, ForeignKey, Integer, Float, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class ProductCategory(str, enum.Enum):
    """What kind of product this batch contains."""

    EGGS = "eggs"
    POULTRY_MEAT = "poultry_meat"
    PORK = "pork"
    BEEF = "beef"
    DAIRY = "dairy"
    CROPS = "crops"
    FEED = "feed"
    BYPRODUCT = "byproduct"  # manure, feathers, etc.
    OTHER = "other"


class BatchStatus(str, enum.Enum):
    """Lifecycle of a product batch."""

    CREATED = "created"
    IN_STORAGE = "in_storage"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    RECALLED = "recalled"
    EXPIRED = "expired"


class TraceabilityBatch(TimestampMixin, TenantMixin, Base):
    """Core product batch — tracks any agricultural product from origin to delivery.

    Vertical-specific fields go in `metadata` (JSON) so the core model
    stays generic while each vertical can store its own data.
    """

    __tablename__ = "traceability_batches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    batch_code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)

    # ── Product identity ──
    product_category: Mapped[ProductCategory] = mapped_column(
        Enum(ProductCategory), default=ProductCategory.EGGS
    )
    product_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    product_type: Mapped[Optional[str]] = mapped_column(
        String(50), default=None
    )  # egg_type, cut_type, milk_grade, crop_variety

    # ── Origin (generic — works for any vertical) ──
    farm_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("farms.id", ondelete="SET NULL"), index=True, default=None
    )
    source_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        default=None, index=True
    )  # flock_id, herd_id, field_id — vertical resolves
    source_type: Mapped[Optional[str]] = mapped_column(
        String(50), default=None
    )  # "flock", "herd", "field"
    origin_location: Mapped[Optional[str]] = mapped_column(
        String(100), default=None
    )  # house, barn, paddock, field name

    # ── Quantity ──
    quantity: Mapped[int] = mapped_column(Integer, default=0)  # total units
    unit_of_measure: Mapped[str] = mapped_column(
        String(20), default="units"
    )  # units, kg, liters, dozens
    container_count: Mapped[int] = mapped_column(
        Integer, default=0
    )  # boxes, crates, pallets
    units_per_container: Mapped[int] = mapped_column(Integer, default=1)

    # ── Quality ──
    quality_grade: Mapped[Optional[str]] = mapped_column(
        String(20), default=None
    )  # A, B, C, organic, free-range
    weight_kg: Mapped[Optional[float]] = mapped_column(Float, default=None)

    # ── GS1 Identifiers ──
    gtin: Mapped[Optional[str]] = mapped_column(
        String(14), default=None
    )  # Global Trade Item Number
    sscc: Mapped[Optional[str]] = mapped_column(
        String(18), default=None
    )  # Serial Shipping Container Code
    tlc: Mapped[Optional[str]] = mapped_column(
        String(100), default=None
    )  # Traceability Lot Code (FSMA 204)

    # ── Status & tracing ──
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus), default=BatchStatus.CREATED
    )
    qr_code: Mapped[Optional[str]] = mapped_column(String(500), default=None)

    # ── Destination ──
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), default=None
    )
    delivery_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    best_before: Mapped[Optional[date]] = mapped_column(Date, default=None)

    # ── Vertical-specific data (JSON) ──
    # EGGlogU: {"egg_size": "L", "rack_number": "R3", "eggs_per_box": 30}
    # PigLogu: {"slaughter_lot": "SL-001", "cut_type": "loin", "carcass_weight": 85.5}
    # CowLogu: {"milking_session": "AM", "fat_pct": 3.8, "protein_pct": 3.2}
    extra_data: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=None)

    # ── GL link ──
    gl_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("journal_entries.id", ondelete="SET NULL"), default=None
    )

    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    # Relationships
    farm = relationship("Farm", back_populates="batches", lazy="selectin")
    client = relationship("Client", back_populates="batches", lazy="selectin")
    events: Mapped[list["TraceEvent"]] = relationship(back_populates="batch")  # noqa: F821
    event_items: Mapped[list["TraceEventItem"]] = relationship(back_populates="batch")  # noqa: F821
    parent_lineages: Mapped[list["BatchLineage"]] = relationship(  # noqa: F821
        back_populates="parent_batch", foreign_keys="[BatchLineage.parent_batch_id]"
    )
    child_lineages: Mapped[list["BatchLineage"]] = relationship(  # noqa: F821
        back_populates="child_batch", foreign_keys="[BatchLineage.child_batch_id]"
    )

    # ── Legacy compatibility ──
    # These properties keep existing EGGlogU frontend code working
    # while the model is now generic.

    @property
    def flock_id(self) -> Optional[uuid.UUID]:
        return self.source_id if self.source_type == "flock" else None

    @property
    def house(self) -> Optional[str]:
        return self.origin_location

    @property
    def box_count(self) -> int:
        return self.container_count

    @property
    def eggs_per_box(self) -> int:
        return self.units_per_container

    @property
    def egg_type(self) -> Optional[str]:
        return self.product_type
