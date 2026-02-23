import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class FlockCreate(BaseModel):
    farm_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    initial_count: int = Field(ge=1, le=10_000_000)
    current_count: int = Field(ge=0, le=10_000_000)
    start_date: date
    breed: Optional[str] = Field(default=None, max_length=100)
    housing_type: Optional[str] = Field(default=None, max_length=100)
    target_curve: Optional[str] = Field(default=None, max_length=100)
    is_active: bool = True


class FlockUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    current_count: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    breed: Optional[str] = Field(default=None, max_length=100)
    housing_type: Optional[str] = Field(default=None, max_length=100)
    target_curve: Optional[str] = Field(default=None, max_length=100)
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
