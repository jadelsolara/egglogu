import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ChecklistItemCreate(BaseModel):
    label: str = Field(min_length=1, max_length=300)
    is_default: bool = False


class ChecklistItemUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=300)
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
    text: str = Field(min_length=1, max_length=5000)


class LogbookEntryUpdate(BaseModel):
    text: Optional[str] = Field(default=None, min_length=1, max_length=5000)


class LogbookEntryRead(BaseModel):
    id: uuid.UUID
    date: date
    text: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonnelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role_desc: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=30)
    start_date: Optional[date] = None
    salary: Optional[float] = Field(default=None, ge=0, le=10_000_000)
    is_active: bool = True


class PersonnelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role_desc: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=30)
    start_date: Optional[date] = None
    salary: Optional[float] = Field(default=None, ge=0, le=10_000_000)
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
