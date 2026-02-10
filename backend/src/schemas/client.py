import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    price_small: Optional[float] = None
    price_medium: Optional[float] = None
    price_large: Optional[float] = None
    price_xl: Optional[float] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    price_small: Optional[float] = None
    price_medium: Optional[float] = None
    price_large: Optional[float] = None
    price_xl: Optional[float] = None


class ClientRead(BaseModel):
    id: uuid.UUID
    name: str
    phone: Optional[str]
    email: Optional[str]
    notes: Optional[str]
    price_small: Optional[float]
    price_medium: Optional[float]
    price_large: Optional[float]
    price_xl: Optional[float]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
