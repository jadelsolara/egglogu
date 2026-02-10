import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class FeedPurchaseCreate(BaseModel):
    date: date
    brand: Optional[str] = None
    type: Optional[str] = None
    kg: float
    price_per_kg: float
    total_cost: float
    batch_code: Optional[str] = None


class FeedPurchaseUpdate(BaseModel):
    brand: Optional[str] = None
    type: Optional[str] = None
    kg: Optional[float] = None
    price_per_kg: Optional[float] = None
    total_cost: Optional[float] = None
    batch_code: Optional[str] = None


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
    feed_kg: float


class FeedConsumptionUpdate(BaseModel):
    feed_kg: Optional[float] = None


class FeedConsumptionRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    feed_kg: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
