"""
Traceability Events — EPCIS 2.0 + FSMA 204 Compliant Event Model (FarmLogU Platform)

Implements the GS1 EPCIS 2.0 event framework adapted for agricultural traceability:
- ObjectEvent: observe, add, delete objects at a location
- AggregationEvent: pack/unpack items into containers
- TransformationEvent: inputs consumed → outputs produced
- TransactionEvent: link batches to business documents (PO, invoice, BOL)

Each event captures Critical Tracking Events (CTEs) with Key Data Elements (KDEs)
per FSMA 204 and EU Regulation 178/2002.

GS1 Identifiers:
- GTIN: product-level identification
- GLN: location identification (farms, warehouses, docks)
- SSCC: shipping container identification
- TLC: Traceability Lot Code (= batch_code in our system)
"""

import enum
import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    DateTime, Date, Enum, ForeignKey, Integer, Float, String, Text, JSON,
    Index, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


# ── EPCIS 2.0 Event Types ──

class TraceEventType(str, enum.Enum):
    """GS1 EPCIS 2.0 event types."""
    OBJECT = "object"                    # Observe/create/delete objects at location
    AGGREGATION = "aggregation"          # Pack/unpack items into containers
    TRANSFORMATION = "transformation"    # Inputs consumed → outputs produced
    TRANSACTION = "transaction"          # Link to business documents


class TraceEventAction(str, enum.Enum):
    """EPCIS action within an event."""
    ADD = "add"          # Object enters the system / is added
    OBSERVE = "observe"  # Object observed at location (no state change)
    DELETE = "delete"    # Object leaves the system / destroyed


# ── FSMA 204 Critical Tracking Events ──

class CriticalTrackingEvent(str, enum.Enum):
    """FSMA 204 CTEs — what happened to the product."""
    GROWING = "growing"              # Farm-level: planting, raising
    HARVESTING = "harvesting"        # Collection from farm/field/flock
    COOLING = "cooling"              # Cold chain initiation
    INITIAL_PACKING = "initial_packing"  # First packing of raw product
    SHIPPING = "shipping"            # Product leaves a location
    RECEIVING = "receiving"          # Product arrives at a location
    TRANSFORMATION = "transformation"  # Processing, mixing, grading
    STORING = "storing"              # Placed in storage
    SELLING = "selling"              # Sale to customer
    RECALLING = "recalling"          # Product recall event


class TraceLocationType(str, enum.Enum):
    """Type of location in the supply chain."""
    FARM = "farm"
    FIELD = "field"
    HOUSE = "house"             # poultry house, barn
    PACKING_SHED = "packing_shed"
    WAREHOUSE = "warehouse"
    COLD_STORAGE = "cold_storage"
    PROCESSING_PLANT = "processing_plant"
    DISTRIBUTION_CENTER = "distribution_center"
    RETAIL = "retail"
    TRANSPORT = "transport"


# ═══════════════════════════════════════════════════════════════════
# GS1 Location Registry — GLN-based location identification
# ═══════════════════════════════════════════════════════════════════

class TraceLocation(TimestampMixin, TenantMixin, Base):
    """Physical or logical location in the supply chain (GS1 GLN).

    Every farm, warehouse, dock, processing plant gets a unique GLN.
    Supports the EU 178/2002 "one step back, one step forward" principle
    by identifying WHERE things happen.
    """
    __tablename__ = "trace_locations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    gln: Mapped[Optional[str]] = mapped_column(String(13), unique=True, default=None)  # GS1 Global Location Number
    location_type: Mapped[TraceLocationType] = mapped_column(Enum(TraceLocationType))

    # Address
    address: Mapped[Optional[str]] = mapped_column(String(500), default=None)
    city: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    region: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    country: Mapped[Optional[str]] = mapped_column(String(3), default=None)  # ISO 3166-1 alpha-3
    latitude: Mapped[Optional[float]] = mapped_column(Float, default=None)
    longitude: Mapped[Optional[float]] = mapped_column(Float, default=None)

    # Link to internal entities
    farm_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("farms.id", ondelete="SET NULL"), default=None
    )
    warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouse_locations.id", ondelete="SET NULL"), default=None
    )

    # Contact for this location
    contact_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    contact_email: Mapped[Optional[str]] = mapped_column(String(200), default=None)

    # Certifications (GAP, organic, HACCP, etc.)
    certifications: Mapped[Optional[dict]] = mapped_column("certifications_data", JSON, default=None)

    is_active: Mapped[bool] = mapped_column(default=True)

    __table_args__ = (
        Index("ix_trace_loc_gln", "gln"),
        Index("ix_trace_loc_org", "organization_id"),
        Index("ix_trace_loc_type", "location_type"),
    )


# ═══════════════════════════════════════════════════════════════════
# EPCIS 2.0 Event Log — The heart of the traceability system
# ═══════════════════════════════════════════════════════════════════

class TraceEvent(TimestampMixin, TenantMixin, Base):
    """EPCIS 2.0 event — records WHAT happened, WHERE, WHEN, and WHY.

    This is the core event log for full supply chain traceability.
    Each event captures a Critical Tracking Event (CTE) with all
    required Key Data Elements (KDEs) per FSMA 204.

    Supports forward trace (origin → consumer) and backward trace
    (consumer → origin) by linking events to batches.
    """
    __tablename__ = "trace_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # ── EPCIS core fields ──
    event_type: Mapped[TraceEventType] = mapped_column(Enum(TraceEventType))
    action: Mapped[TraceEventAction] = mapped_column(
        Enum(TraceEventAction), default=TraceEventAction.OBSERVE
    )
    cte: Mapped[CriticalTrackingEvent] = mapped_column(Enum(CriticalTrackingEvent))

    # ── WHEN ──
    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    event_timezone: Mapped[Optional[str]] = mapped_column(String(50), default=None)  # e.g., "America/Santiago"
    record_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")

    # ── WHERE ── (GS1 location)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("trace_locations.id", ondelete="SET NULL"), default=None
    )
    read_point: Mapped[Optional[str]] = mapped_column(String(200), default=None)  # Specific point (dock 3, line 2)

    # ── Source & Destination (for shipping/receiving) ──
    source_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("trace_locations.id", ondelete="SET NULL"), default=None
    )
    destination_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("trace_locations.id", ondelete="SET NULL"), default=None
    )

    # ── WHO ── (user who recorded the event)
    recorded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    # ── WHAT ── (primary batch this event relates to)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("traceability_batches.id", ondelete="CASCADE"), index=True, default=None
    )

    # ── Business context ──
    description: Mapped[Optional[str]] = mapped_column(String(500), default=None)
    disposition: Mapped[Optional[str]] = mapped_column(String(100), default=None)  # EPCIS disposition: in_transit, in_progress, active, recalled

    # ── Business document references ──
    biz_transaction_type: Mapped[Optional[str]] = mapped_column(String(50), default=None)  # po, invoice, bol, desadv
    biz_transaction_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)  # PO-2026-001

    # ── Shipping / logistics ──
    carrier: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    vehicle_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    sscc: Mapped[Optional[str]] = mapped_column(String(18), default=None)  # GS1 Serial Shipping Container Code

    # ── Sensor data (EPCIS 2.0 SensorElement) ──
    temperature_c: Mapped[Optional[float]] = mapped_column(Float, default=None)
    humidity_pct: Mapped[Optional[float]] = mapped_column(Float, default=None)

    # ── KDE capture (flexible JSON for CTE-specific data) ──
    # Harvesting: {"commodity": "eggs", "variety": "brown", "method": "automated"}
    # Cooling: {"method": "forced_air", "target_temp": 4.0, "actual_temp": 4.2}
    # Packing: {"pack_date": "2026-03-08", "container_type": "carton_30"}
    # Shipping: {"bol_number": "BOL-001", "seal_number": "S-123"}
    kde_data: Mapped[Optional[dict]] = mapped_column("kde_data", JSON, default=None)

    # ── Integrity ──
    event_hash: Mapped[Optional[str]] = mapped_column(String(64), default=None)  # SHA-256 for tamper detection
    prev_event_hash: Mapped[Optional[str]] = mapped_column(String(64), default=None)  # Chain to previous event

    # Relationships
    location = relationship("TraceLocation", foreign_keys=[location_id], lazy="selectin")
    source_location = relationship("TraceLocation", foreign_keys=[source_location_id], lazy="selectin")
    destination_location = relationship("TraceLocation", foreign_keys=[destination_location_id], lazy="selectin")
    batch = relationship("TraceabilityBatch", lazy="selectin")
    items = relationship("TraceEventItem", back_populates="event", lazy="selectin")

    __table_args__ = (
        Index("ix_trace_event_batch", "batch_id"),
        Index("ix_trace_event_time", "event_time"),
        Index("ix_trace_event_cte", "cte"),
        Index("ix_trace_event_org", "organization_id"),
        Index("ix_trace_event_loc", "location_id"),
    )


class TraceEventItem(TimestampMixin, Base):
    """Individual batch/item referenced in an event.

    An event can reference multiple batches (e.g., aggregation packs
    3 batches into 1 pallet, transformation consumes 2 inputs).
    """
    __tablename__ = "trace_event_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trace_events.id", ondelete="CASCADE"), index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("traceability_batches.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))  # "input", "output", "observed", "parent", "child"
    quantity: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    gtin: Mapped[Optional[str]] = mapped_column(String(14), default=None)  # GS1 GTIN

    event = relationship("TraceEvent", back_populates="items")
    batch = relationship("TraceabilityBatch", lazy="selectin")


# ═══════════════════════════════════════════════════════════════════
# Batch Lineage — Parent/Child relationships (transformation chain)
# ═══════════════════════════════════════════════════════════════════

class BatchLineage(TimestampMixin, Base):
    """Links parent → child batches for transformation traceability.

    Examples:
    - Feed batch A + Feed batch B → Mixed feed batch C (transformation)
    - Egg batch → Graded eggs batch (grading)
    - Raw milk batch → Pasteurized milk batch (processing)
    - Harvest lot → Packed product lot (packing)

    Enables forward trace: "which products came from this input?"
    Enables backward trace: "what inputs went into this product?"
    """
    __tablename__ = "batch_lineage"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    parent_batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("traceability_batches.id", ondelete="CASCADE"), index=True
    )
    child_batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("traceability_batches.id", ondelete="CASCADE"), index=True
    )
    transformation_event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("trace_events.id", ondelete="SET NULL"), default=None
    )

    # How much of the parent was consumed
    quantity_consumed: Mapped[Optional[float]] = mapped_column(Float, default=None)
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(20), default=None)

    parent_batch = relationship("TraceabilityBatch", foreign_keys=[parent_batch_id], lazy="selectin")
    child_batch = relationship("TraceabilityBatch", foreign_keys=[child_batch_id], lazy="selectin")

    __table_args__ = (
        UniqueConstraint("parent_batch_id", "child_batch_id", name="uq_lineage_parent_child"),
        Index("ix_lineage_parent", "parent_batch_id"),
        Index("ix_lineage_child", "child_batch_id"),
    )


# ═══════════════════════════════════════════════════════════════════
# Recall Management — Mock recall + real recall execution
# ═══════════════════════════════════════════════════════════════════

class RecallStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    MOCK = "mock"  # Simulation/drill


class RecallScope(str, enum.Enum):
    BATCH = "batch"           # Single batch
    PRODUCT = "product"       # All batches of a product
    LOCATION = "location"     # All batches from a location
    SUPPLIER = "supplier"     # All batches from a supplier
    DATE_RANGE = "date_range"  # All batches in a date range


class TraceRecall(TimestampMixin, TenantMixin, Base):
    """Product recall tracking — FSMA 204 compliant.

    Supports both mock recalls (drills) and real recalls.
    Links to affected batches and tracks notification status.
    """
    __tablename__ = "trace_recalls"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recall_number: Mapped[str] = mapped_column(String(50), unique=True)
    status: Mapped[RecallStatus] = mapped_column(Enum(RecallStatus), default=RecallStatus.DRAFT)
    scope: Mapped[RecallScope] = mapped_column(Enum(RecallScope))

    # What triggered the recall
    reason: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20))  # "class_i" (dangerous), "class_ii" (remote danger), "class_iii" (no danger)

    # Scope parameters
    trigger_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("traceability_batches.id", ondelete="SET NULL"), default=None
    )
    product_category: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    date_from: Mapped[Optional[date]] = mapped_column(Date, default=None)
    date_to: Mapped[Optional[date]] = mapped_column(Date, default=None)

    # Execution
    initiated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    initiated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)

    # Results
    batches_affected: Mapped[int] = mapped_column(Integer, default=0)
    units_affected: Mapped[int] = mapped_column(Integer, default=0)
    units_recovered: Mapped[int] = mapped_column(Integer, default=0)
    clients_notified: Mapped[int] = mapped_column(Integer, default=0)

    # Trace timing (FSMA requires trace within 24 hours)
    trace_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    trace_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)

    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    __table_args__ = (
        Index("ix_recall_org", "organization_id"),
        Index("ix_recall_status", "status"),
    )


class RecallBatch(TimestampMixin, Base):
    """Batches affected by a recall."""
    __tablename__ = "recall_batches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recall_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trace_recalls.id", ondelete="CASCADE"), index=True
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("traceability_batches.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), default=None
    )

    # Status of this specific batch in the recall
    notification_sent: Mapped[bool] = mapped_column(default=False)
    notification_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    units_in_batch: Mapped[int] = mapped_column(Integer, default=0)
    units_recovered: Mapped[int] = mapped_column(Integer, default=0)
    recovery_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    disposition: Mapped[Optional[str]] = mapped_column(String(50), default=None)  # destroyed, returned, quarantined

    __table_args__ = (
        UniqueConstraint("recall_id", "batch_id", name="uq_recall_batch"),
    )
