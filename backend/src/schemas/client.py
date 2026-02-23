import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[EmailStr] = None
    notes: Optional[str] = Field(default=None, max_length=2000)
    price_small: Optional[float] = Field(default=None, ge=0, le=100_000)
    price_medium: Optional[float] = Field(default=None, ge=0, le=100_000)
    price_large: Optional[float] = Field(default=None, ge=0, le=100_000)
    price_xl: Optional[float] = Field(default=None, ge=0, le=100_000)


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[EmailStr] = None
    notes: Optional[str] = Field(default=None, max_length=2000)
    price_small: Optional[float] = Field(default=None, ge=0, le=100_000)
    price_medium: Optional[float] = Field(default=None, ge=0, le=100_000)
    price_large: Optional[float] = Field(default=None, ge=0, le=100_000)
    price_xl: Optional[float] = Field(default=None, ge=0, le=100_000)


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
