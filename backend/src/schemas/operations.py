import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ChecklistItemCreate(BaseModel):
    label: str
    is_default: bool = False


class ChecklistItemUpdate(BaseModel):
    label: Optional[str] = None
    is_default: Optional[bool] = None


class ChecklistItemRead(BaseModel):
    id: uuid.UUID
    label: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LogbookEntryCreate(BaseModel):
    date: date
    text: str


class LogbookEntryUpdate(BaseModel):
    text: Optional[str] = None


class LogbookEntryRead(BaseModel):
    id: uuid.UUID
    date: date
    text: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonnelCreate(BaseModel):
    name: str
    role_desc: Optional[str] = None
    phone: Optional[str] = None
    start_date: Optional[date] = None
    salary: Optional[float] = None
    is_active: bool = True


class PersonnelUpdate(BaseModel):
    name: Optional[str] = None
    role_desc: Optional[str] = None
    phone: Optional[str] = None
    start_date: Optional[date] = None
    salary: Optional[float] = None
    is_active: Optional[bool] = None


class PersonnelRead(BaseModel):
    id: uuid.UUID
    name: str
    role_desc: Optional[str]
    phone: Optional[str]
    start_date: Optional[date]
    salary: Optional[float]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
