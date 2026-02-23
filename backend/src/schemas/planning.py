import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProductionPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    target_date: Optional[date] = None
    client_id: Optional[uuid.UUID] = None
    eggs_needed: int = Field(default=0, ge=0, le=100_000_000)
    notes: Optional[str] = Field(default=None, max_length=2000)
    flock_allocations_json: Optional[str] = Field(default=None, max_length=10_000)


class ProductionPlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    target_date: Optional[date] = None
    client_id: Optional[uuid.UUID] = None
    eggs_needed: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    notes: Optional[str] = Field(default=None, max_length=2000)
    flock_allocations_json: Optional[str] = Field(default=None, max_length=10_000)


class ProductionPlanRead(BaseModel):
    id: uuid.UUID
    name: str
    target_date: Optional[date]
    client_id: Optional[uuid.UUID]
    eggs_needed: int
    notes: Optional[str]
    flock_allocations_json: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
