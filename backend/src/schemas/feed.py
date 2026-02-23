import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class FeedPurchaseCreate(BaseModel):
    date: date
    brand: Optional[str] = Field(default=None, max_length=200)
    type: Optional[str] = Field(default=None, max_length=100)
    kg: float = Field(gt=0, le=1_000_000)
    price_per_kg: float = Field(ge=0, le=100_000)
    total_cost: float = Field(ge=0, le=100_000_000)
    batch_code: Optional[str] = Field(default=None, max_length=100)


class FeedPurchaseUpdate(BaseModel):
    brand: Optional[str] = Field(default=None, max_length=200)
    type: Optional[str] = Field(default=None, max_length=100)
    kg: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    price_per_kg: Optional[float] = Field(default=None, ge=0, le=100_000)
    total_cost: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    batch_code: Optional[str] = Field(default=None, max_length=100)


class FeedPurchaseRead(BaseModel):
    id: uuid.UUID
    date: date
    brand: Optional[str]
    type: Optional[str]
    kg: float
    price_per_kg: float
    total_cost: float
    batch_code: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FeedConsumptionCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    feed_kg: float = Field(gt=0, le=1_000_000)


class FeedConsumptionUpdate(BaseModel):
    feed_kg: Optional[float] = Field(default=None, gt=0, le=1_000_000)


class FeedConsumptionRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    feed_kg: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
