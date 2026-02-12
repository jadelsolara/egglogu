import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RiskLevelEnum(str, Enum):
    green = "green"
    yellow = "yellow"
    red = "red"


class PestTypeEnum(str, Enum):
    rodent = "rodent"
    fly = "fly"
    wild_bird = "wild_bird"
    other = "other"


class ProtocolFrequencyEnum(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


# --- BiosecurityVisitor ---

class BiosecurityVisitorCreate(BaseModel):
    date: date
    name: str
    company: Optional[str] = None
    purpose: Optional[str] = None
    zone: Optional[str] = None
    vehicle_plate: Optional[str] = None
    disinfected: bool = False
    from_farm_health: Optional[str] = None
    notes: Optional[str] = None


class BiosecurityVisitorUpdate(BaseModel):
    date: Optional[date] = None
    name: Optional[str] = None
    company: Optional[str] = None
    purpose: Optional[str] = None
    zone: Optional[str] = None
    vehicle_plate: Optional[str] = None
    disinfected: Optional[bool] = None
    from_farm_health: Optional[str] = None
    notes: Optional[str] = None


class BiosecurityVisitorRead(BaseModel):
    id: uuid.UUID
    date: date
    name: str
    company: Optional[str]
    purpose: Optional[str]
    zone: Optional[str]
    vehicle_plate: Optional[str]
    disinfected: bool
    from_farm_health: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- BiosecurityZone ---

class BiosecurityZoneCreate(BaseModel):
    name: str
    risk_level: RiskLevelEnum = RiskLevelEnum.green
    last_disinfection: Optional[datetime] = None
    frequency_days: Optional[int] = None
    notes: Optional[str] = None


class BiosecurityZoneUpdate(BaseModel):
    name: Optional[str] = None
    risk_level: Optional[RiskLevelEnum] = None
    last_disinfection: Optional[datetime] = None
    frequency_days: Optional[int] = None
    notes: Optional[str] = None


class BiosecurityZoneRead(BaseModel):
    id: uuid.UUID
    name: str
    risk_level: str
    last_disinfection: Optional[datetime]
    frequency_days: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- PestSighting ---

class PestSightingCreate(BaseModel):
    date: date
    type: PestTypeEnum
    location: Optional[str] = None
    severity: int = Field(default=1, ge=1, le=5)
    action: Optional[str] = None
    resolved: bool = False
    notes: Optional[str] = None


class PestSightingUpdate(BaseModel):
    date: Optional[date] = None
    type: Optional[PestTypeEnum] = None
    location: Optional[str] = None
    severity: Optional[int] = Field(default=None, ge=1, le=5)
    action: Optional[str] = None
    resolved: Optional[bool] = None
    notes: Optional[str] = None


class PestSightingRead(BaseModel):
    id: uuid.UUID
    date: date
    type: str
    location: Optional[str]
    severity: int
    action: Optional[str]
    resolved: bool
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- BiosecurityProtocol ---

class BiosecurityProtocolCreate(BaseModel):
    name: str
    frequency: ProtocolFrequencyEnum = ProtocolFrequencyEnum.daily
    last_completed: Optional[datetime] = None
    items_json: Optional[str] = None
    notes: Optional[str] = None


class BiosecurityProtocolUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[ProtocolFrequencyEnum] = None
    last_completed: Optional[datetime] = None
    items_json: Optional[str] = None
    notes: Optional[str] = None


class BiosecurityProtocolRead(BaseModel):
    id: uuid.UUID
    name: str
    frequency: str
    last_completed: Optional[datetime]
    items_json: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
