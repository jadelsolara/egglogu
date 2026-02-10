import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class VaccineCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    name: str
    method: Optional[str] = None
    notes: Optional[str] = None


class VaccineUpdate(BaseModel):
    name: Optional[str] = None
    method: Optional[str] = None
    notes: Optional[str] = None


class VaccineRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    name: str
    method: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MedicationCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    name: str
    dosage: Optional[str] = None
    duration_days: Optional[int] = None
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    duration_days: Optional[int] = None
    notes: Optional[str] = None


class MedicationRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    name: str
    dosage: Optional[str]
    duration_days: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OutbreakCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    disease: str
    affected_count: int = 0
    deaths: int = 0
    treatment: Optional[str] = None
    resolved: bool = False


class OutbreakUpdate(BaseModel):
    disease: Optional[str] = None
    affected_count: Optional[int] = None
    deaths: Optional[int] = None
    treatment: Optional[str] = None
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
    type: str
    severity: int
    description: Optional[str] = None


class StressEventUpdate(BaseModel):
    type: Optional[str] = None
    severity: Optional[int] = None
    description: Optional[str] = None


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
