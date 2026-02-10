import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class FlockCreate(BaseModel):
    farm_id: uuid.UUID
    name: str
    initial_count: int
    current_count: int
    start_date: date
    breed: Optional[str] = None
    housing_type: Optional[str] = None
    target_curve: Optional[str] = None
    is_active: bool = True


class FlockUpdate(BaseModel):
    name: Optional[str] = None
    current_count: Optional[int] = None
    breed: Optional[str] = None
    housing_type: Optional[str] = None
    target_curve: Optional[str] = None
    is_active: Optional[bool] = None


class FlockRead(BaseModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    name: str
    initial_count: int
    current_count: int
    start_date: date
    breed: Optional[str]
    housing_type: Optional[str]
    target_curve: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
