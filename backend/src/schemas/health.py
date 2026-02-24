import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class VaccineCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    name: str = Field(min_length=1, max_length=200)
    method: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=2000)
    cost: Optional[float] = Field(default=None, ge=0, le=10_000_000)


class VaccineUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    method: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=2000)
    cost: Optional[float] = Field(default=None, ge=0, le=10_000_000)


class VaccineRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    name: str
    method: Optional[str]
    notes: Optional[str]
    cost: Optional[float]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MedicationCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    name: str = Field(min_length=1, max_length=200)
    dosage: Optional[str] = Field(default=None, max_length=200)
    duration_days: Optional[int] = Field(default=None, ge=1, le=365)
    notes: Optional[str] = Field(default=None, max_length=2000)
    cost: Optional[float] = Field(default=None, ge=0, le=10_000_000)


class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    dosage: Optional[str] = Field(default=None, max_length=200)
    duration_days: Optional[int] = Field(default=None, ge=1, le=365)
    notes: Optional[str] = Field(default=None, max_length=2000)
    cost: Optional[float] = Field(default=None, ge=0, le=10_000_000)


class MedicationRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    name: str
    dosage: Optional[str]
    duration_days: Optional[int]
    notes: Optional[str]
    cost: Optional[float]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OutbreakCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    disease: str = Field(min_length=1, max_length=200)
    affected_count: int = Field(default=0, ge=0, le=10_000_000)
    deaths: int = Field(default=0, ge=0, le=10_000_000)
    treatment: Optional[str] = Field(default=None, max_length=1000)
    resolved: bool = False


class OutbreakUpdate(BaseModel):
    disease: Optional[str] = Field(default=None, min_length=1, max_length=200)
    affected_count: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    deaths: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    treatment: Optional[str] = Field(default=None, max_length=1000)
    resolved: Optional[bool] = None


class OutbreakRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    disease: str
    affected_count: int
    deaths: int
    treatment: Optional[str]
    resolved: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class StressEventCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    type: str = Field(min_length=1, max_length=100)
    severity: int = Field(ge=1, le=10)
    description: Optional[str] = Field(default=None, max_length=2000)


class StressEventUpdate(BaseModel):
    type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    severity: Optional[int] = Field(default=None, ge=1, le=10)
    description: Optional[str] = Field(default=None, max_length=2000)


class StressEventRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    type: str
    severity: int
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
