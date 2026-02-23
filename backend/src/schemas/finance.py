import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class IncomeCreate(BaseModel):
    client_id: uuid.UUID
    date: date
    dozens: float = Field(gt=0, le=1_000_000)
    egg_size: Optional[str] = Field(default=None, max_length=50)
    unit_price: float = Field(ge=0, le=100_000)
    total: float = Field(ge=0, le=100_000_000)
    payment_method: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=2000)


class IncomeUpdate(BaseModel):
    dozens: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    egg_size: Optional[str] = Field(default=None, max_length=50)
    unit_price: Optional[float] = Field(default=None, ge=0, le=100_000)
    total: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    payment_method: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=2000)


class IncomeRead(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    date: date
    dozens: float
    egg_size: Optional[str]
    unit_price: float
    total: float
    payment_method: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    date: date
    category: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    amount: float = Field(gt=0, le=100_000_000)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ExpenseUpdate(BaseModel):
    category: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    amount: Optional[float] = Field(default=None, gt=0, le=100_000_000)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ExpenseRead(BaseModel):
    id: uuid.UUID
    date: date
    category: str
    description: Optional[str]
    amount: float
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReceivableCreate(BaseModel):
    client_id: uuid.UUID
    date: date
    amount: float = Field(gt=0, le=100_000_000)
    due_date: Optional[date] = None
    paid: bool = False
    paid_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class ReceivableUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0, le=100_000_000)
    due_date: Optional[date] = None
    paid: Optional[bool] = None
    paid_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class ReceivableRead(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    date: date
    amount: float
    due_date: Optional[date]
    paid: bool
    paid_date: Optional[date]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
