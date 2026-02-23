import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class TraceabilityBatchCreate(BaseModel):
    date: date
    flock_id: uuid.UUID
    house: Optional[str] = Field(default=None, max_length=100)
    rack_number: Optional[str] = Field(default=None, max_length=50)
    box_count: int = Field(default=0, ge=0, le=100_000)
    eggs_per_box: int = Field(default=30, ge=1, le=1000)
    egg_type: Optional[str] = Field(default=None, max_length=50)
    client_id: Optional[uuid.UUID] = None
    delivery_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class TraceabilityBatchUpdate(BaseModel):
    date: Optional[date] = None
    flock_id: Optional[uuid.UUID] = None
    house: Optional[str] = Field(default=None, max_length=100)
    rack_number: Optional[str] = Field(default=None, max_length=50)
    box_count: Optional[int] = Field(default=None, ge=0, le=100_000)
    eggs_per_box: Optional[int] = Field(default=None, ge=1, le=1000)
    egg_type: Optional[str] = Field(default=None, max_length=50)
    client_id: Optional[uuid.UUID] = None
    delivery_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class TraceabilityBatchRead(BaseModel):
    id: uuid.UUID
    batch_code: str
    date: date
    flock_id: uuid.UUID
    house: Optional[str]
    rack_number: Optional[str]
    box_count: int
    eggs_per_box: int
    egg_type: Optional[str]
    qr_code: Optional[str]
    client_id: Optional[uuid.UUID]
    delivery_date: Optional[date]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Public trace response (no auth, for QR scan) ──

class TraceFlockInfo(BaseModel):
    name: str
    breed: Optional[str] = None
    housing_type: Optional[str] = None
    start_date: Optional[date] = None

    model_config = {"from_attributes": True}


class TraceFarmInfo(BaseModel):
    name: str

    model_config = {"from_attributes": True}


class TracePublicResponse(BaseModel):
    """What a client/inspector sees when scanning the QR code."""
    batch_code: str
    date: date
    total_eggs: int
    box_count: int
    eggs_per_box: int
    egg_type: Optional[str] = None
    house: Optional[str] = None
    delivery_date: Optional[date] = None
    flock: Optional[TraceFlockInfo] = None
    farm: Optional[TraceFarmInfo] = None
    packed_at: datetime
