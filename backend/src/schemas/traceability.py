"""Pydantic v2 schemas for core Traceability (FarmLogU Platform)."""

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from src.models.traceability import ProductCategory, BatchStatus


class TraceabilityBatchCreate(BaseModel):
    date: date
    product_category: ProductCategory = ProductCategory.EGGS
    product_name: Optional[str] = Field(default=None, max_length=200)
    product_type: Optional[str] = Field(default=None, max_length=50)
    farm_id: Optional[uuid.UUID] = None
    source_id: Optional[uuid.UUID] = None  # flock_id, herd_id, field_id
    source_type: Optional[str] = Field(default=None, max_length=50)  # "flock", "herd", "field"
    origin_location: Optional[str] = Field(default=None, max_length=100)
    quantity: int = Field(default=0, ge=0, le=10_000_000)
    unit_of_measure: str = Field(default="units", max_length=20)
    container_count: int = Field(default=0, ge=0, le=100_000)
    units_per_container: int = Field(default=1, ge=1, le=10_000)
    quality_grade: Optional[str] = Field(default=None, max_length=20)
    weight_kg: Optional[float] = Field(default=None, ge=0)
    client_id: Optional[uuid.UUID] = None
    delivery_date: Optional[date] = None
    best_before: Optional[date] = None
    extra_data: Optional[dict] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class TraceabilityBatchUpdate(BaseModel):
    product_name: Optional[str] = Field(default=None, max_length=200)
    product_type: Optional[str] = Field(default=None, max_length=50)
    origin_location: Optional[str] = Field(default=None, max_length=100)
    quantity: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    container_count: Optional[int] = Field(default=None, ge=0, le=100_000)
    units_per_container: Optional[int] = Field(default=None, ge=1, le=10_000)
    quality_grade: Optional[str] = Field(default=None, max_length=20)
    weight_kg: Optional[float] = Field(default=None, ge=0)
    status: Optional[BatchStatus] = None
    client_id: Optional[uuid.UUID] = None
    delivery_date: Optional[date] = None
    best_before: Optional[date] = None
    extra_data: Optional[dict] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class TraceabilityBatchRead(BaseModel):
    id: uuid.UUID
    batch_code: str
    date: date
    product_category: ProductCategory
    product_name: Optional[str]
    product_type: Optional[str]
    farm_id: Optional[uuid.UUID]
    source_id: Optional[uuid.UUID]
    source_type: Optional[str]
    origin_location: Optional[str]
    quantity: int
    unit_of_measure: str
    container_count: int
    units_per_container: int
    quality_grade: Optional[str]
    weight_kg: Optional[float]
    status: BatchStatus
    qr_code: Optional[str]
    client_id: Optional[uuid.UUID]
    delivery_date: Optional[date]
    best_before: Optional[date]
    extra_data: Optional[dict]
    gl_entry_id: Optional[uuid.UUID]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Public trace response (no auth, for QR scan) ──


class TraceFarmInfo(BaseModel):
    name: str
    model_config = {"from_attributes": True}


class TraceOriginInfo(BaseModel):
    """Generic origin info — works for flock, herd, field, etc."""
    name: Optional[str] = None
    type: Optional[str] = None  # "flock", "herd", "field"
    start_date: Optional[date] = None
    model_config = {"from_attributes": True}


class TracePublicResponse(BaseModel):
    """What a client/inspector sees when scanning the QR code."""
    batch_code: str
    date: date
    product_category: str
    product_name: Optional[str] = None
    product_type: Optional[str] = None
    quantity: int
    unit_of_measure: str
    container_count: int
    units_per_container: int
    quality_grade: Optional[str] = None
    origin_location: Optional[str] = None
    delivery_date: Optional[date] = None
    best_before: Optional[date] = None
    farm: Optional[TraceFarmInfo] = None
    origin: Optional[TraceOriginInfo] = None
    packed_at: datetime
