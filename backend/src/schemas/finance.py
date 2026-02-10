import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class IncomeCreate(BaseModel):
    client_id: uuid.UUID
    date: date
    dozens: float
    egg_size: Optional[str] = None
    unit_price: float
    total: float
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class IncomeUpdate(BaseModel):
    dozens: Optional[float] = None
    egg_size: Optional[str] = None
    unit_price: Optional[float] = None
    total: Optional[float] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


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
    category: str
    description: Optional[str] = None
    amount: float
    notes: Optional[str] = None


class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    notes: Optional[str] = None


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
    amount: float
    due_date: Optional[date] = None
    paid: bool = False
    paid_date: Optional[date] = None
    notes: Optional[str] = None


class ReceivableUpdate(BaseModel):
    amount: Optional[float] = None
    due_date: Optional[date] = None
    paid: Optional[bool] = None
    paid_date: Optional[date] = None
    notes: Optional[str] = None


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
