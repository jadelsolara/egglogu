import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ProductionPlanCreate(BaseModel):
    name: str
    target_date: Optional[date] = None
    client_id: Optional[uuid.UUID] = None
    eggs_needed: int = 0
    notes: Optional[str] = None
    flock_allocations_json: Optional[str] = None


class ProductionPlanUpdate(BaseModel):
    name: Optional[str] = None
    target_date: Optional[date] = None
    client_id: Optional[uuid.UUID] = None
    eggs_needed: Optional[int] = None
    notes: Optional[str] = None
    flock_allocations_json: Optional[str] = None


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
