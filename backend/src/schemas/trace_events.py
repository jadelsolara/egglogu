"""Pydantic v2 schemas for EPCIS 2.0 Traceability Events (FarmLogU Platform)."""

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from src.models.trace_events import (
    TraceEventType,
    TraceEventAction,
    CriticalTrackingEvent,
    TraceLocationType,
    RecallStatus,
    RecallScope,
)


# ── Location schemas ──


class TraceLocationCreate(BaseModel):
    name: str = Field(max_length=200)
    gln: Optional[str] = Field(default=None, max_length=13)
    location_type: TraceLocationType
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    region: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=3)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    farm_id: Optional[uuid.UUID] = None
    warehouse_id: Optional[uuid.UUID] = None
    contact_name: Optional[str] = Field(default=None, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=50)
    contact_email: Optional[str] = Field(default=None, max_length=200)
    certifications: Optional[dict] = None


class TraceLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    gln: Optional[str] = Field(default=None, max_length=13)
    location_type: Optional[TraceLocationType] = None
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    region: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default=None, max_length=3)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_name: Optional[str] = Field(default=None, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=50)
    contact_email: Optional[str] = Field(default=None, max_length=200)
    certifications: Optional[dict] = None
    is_active: Optional[bool] = None


class TraceLocationRead(BaseModel):
    id: uuid.UUID
    name: str
    gln: Optional[str]
    location_type: TraceLocationType
    address: Optional[str]
    city: Optional[str]
    region: Optional[str]
    country: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    farm_id: Optional[uuid.UUID]
    warehouse_id: Optional[uuid.UUID]
    contact_name: Optional[str]
    contact_phone: Optional[str]
    contact_email: Optional[str]
    certifications: Optional[dict]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Event Item schemas ──


class TraceEventItemCreate(BaseModel):
    batch_id: uuid.UUID
    role: str = Field(max_length=20)  # input, output, observed, parent, child
    quantity: Optional[int] = None
    unit_of_measure: Optional[str] = Field(default=None, max_length=20)
    gtin: Optional[str] = Field(default=None, max_length=14)


class TraceEventItemRead(BaseModel):
    id: uuid.UUID
    batch_id: uuid.UUID
    role: str
    quantity: Optional[int]
    unit_of_measure: Optional[str]
    gtin: Optional[str]
    model_config = {"from_attributes": True}


# ── Event schemas ──


class TraceEventCreate(BaseModel):
    event_type: TraceEventType
    action: TraceEventAction = TraceEventAction.OBSERVE
    cte: CriticalTrackingEvent
    event_time: datetime
    event_timezone: Optional[str] = Field(default=None, max_length=50)
    location_id: Optional[uuid.UUID] = None
    read_point: Optional[str] = Field(default=None, max_length=200)
    source_location_id: Optional[uuid.UUID] = None
    destination_location_id: Optional[uuid.UUID] = None
    batch_id: Optional[uuid.UUID] = None
    description: Optional[str] = Field(default=None, max_length=500)
    disposition: Optional[str] = Field(default=None, max_length=100)
    biz_transaction_type: Optional[str] = Field(default=None, max_length=50)
    biz_transaction_id: Optional[str] = Field(default=None, max_length=100)
    carrier: Optional[str] = Field(default=None, max_length=200)
    vehicle_id: Optional[str] = Field(default=None, max_length=100)
    sscc: Optional[str] = Field(default=None, max_length=18)
    temperature_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    kde_data: Optional[dict] = None
    items: list[TraceEventItemCreate] = Field(default_factory=list)


class TraceEventRead(BaseModel):
    id: uuid.UUID
    event_type: TraceEventType
    action: TraceEventAction
    cte: CriticalTrackingEvent
    event_time: datetime
    event_timezone: Optional[str]
    record_time: datetime
    location_id: Optional[uuid.UUID]
    read_point: Optional[str]
    source_location_id: Optional[uuid.UUID]
    destination_location_id: Optional[uuid.UUID]
    recorded_by: Optional[uuid.UUID]
    batch_id: Optional[uuid.UUID]
    description: Optional[str]
    disposition: Optional[str]
    biz_transaction_type: Optional[str]
    biz_transaction_id: Optional[str]
    carrier: Optional[str]
    vehicle_id: Optional[str]
    sscc: Optional[str]
    temperature_c: Optional[float]
    humidity_pct: Optional[float]
    kde_data: Optional[dict]
    event_hash: Optional[str]
    items: list[TraceEventItemRead] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Batch Lineage schemas ──


class BatchLineageCreate(BaseModel):
    parent_batch_id: uuid.UUID
    child_batch_id: uuid.UUID
    transformation_event_id: Optional[uuid.UUID] = None
    quantity_consumed: Optional[float] = None
    unit_of_measure: Optional[str] = Field(default=None, max_length=20)


class BatchLineageRead(BaseModel):
    id: uuid.UUID
    parent_batch_id: uuid.UUID
    child_batch_id: uuid.UUID
    transformation_event_id: Optional[uuid.UUID]
    quantity_consumed: Optional[float]
    unit_of_measure: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Recall schemas ──


class RecallCreate(BaseModel):
    scope: RecallScope
    reason: str = Field(min_length=1)
    severity: str = Field(max_length=20)  # class_i, class_ii, class_iii
    trigger_batch_id: Optional[uuid.UUID] = None
    product_category: Optional[str] = Field(default=None, max_length=50)
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    is_mock: bool = False  # True = drill, False = real recall


class RecallRead(BaseModel):
    id: uuid.UUID
    recall_number: str
    status: RecallStatus
    scope: RecallScope
    reason: str
    severity: str
    trigger_batch_id: Optional[uuid.UUID]
    product_category: Optional[str]
    date_from: Optional[date]
    date_to: Optional[date]
    initiated_by: Optional[uuid.UUID]
    initiated_at: Optional[datetime]
    completed_at: Optional[datetime]
    batches_affected: int
    units_affected: int
    units_recovered: int
    clients_notified: int
    trace_started_at: Optional[datetime]
    trace_completed_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Trace query responses ──


class TraceChainNode(BaseModel):
    """A node in the forward/backward trace chain."""

    batch_id: uuid.UUID
    batch_code: str
    product_category: str
    product_name: Optional[str] = None
    quantity: int
    unit_of_measure: str
    status: str
    date: date
    origin_location: Optional[str] = None
    farm_name: Optional[str] = None
    depth: int  # 0 = origin batch, positive = forward, negative = backward


class TraceChainEvent(BaseModel):
    """An event in the trace chain timeline."""

    event_id: uuid.UUID
    event_type: str
    cte: str
    event_time: datetime
    location_name: Optional[str] = None
    description: Optional[str] = None
    disposition: Optional[str] = None
    temperature_c: Optional[float] = None


class FullTraceResponse(BaseModel):
    """Complete forward + backward trace for a batch."""

    origin_batch: TraceChainNode
    backward_chain: list[TraceChainNode] = []  # Inputs that went into this batch
    forward_chain: list[TraceChainNode] = []  # Products that came from this batch
    events: list[TraceChainEvent] = []  # Timeline of all events
    trace_time_ms: int  # How long the trace took (FSMA: must be < 24 hours)
