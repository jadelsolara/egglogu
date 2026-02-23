import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class EggTypeEnum(str, Enum):
    conventional = "conventional"
    free_range = "free_range"
    organic = "organic"
    pasture_raised = "pasture_raised"
    decorative = "decorative"


class MarketChannelEnum(str, Enum):
    wholesale = "wholesale"
    supermarket = "supermarket"
    restaurant = "restaurant"
    direct = "direct"
    export = "export"
    pasteurized = "pasteurized"


class DailyProductionCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    total_eggs: int = Field(default=0, ge=0, le=500_000)
    broken: int = Field(default=0, ge=0, le=500_000)
    small: int = Field(default=0, ge=0, le=500_000)
    medium: int = Field(default=0, ge=0, le=500_000)
    large: int = Field(default=0, ge=0, le=500_000)
    xl: int = Field(default=0, ge=0, le=500_000)
    deaths: int = Field(default=0, ge=0, le=100_000)
    egg_mass_g: Optional[float] = Field(default=None, ge=0, le=200)
    water_liters: Optional[float] = Field(default=None, ge=0, le=100_000)
    egg_type: Optional[EggTypeEnum] = None
    market_channel: Optional[MarketChannelEnum] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class DailyProductionUpdate(BaseModel):
    total_eggs: Optional[int] = Field(default=None, ge=0, le=500_000)
    broken: Optional[int] = Field(default=None, ge=0, le=500_000)
    small: Optional[int] = Field(default=None, ge=0, le=500_000)
    medium: Optional[int] = Field(default=None, ge=0, le=500_000)
    large: Optional[int] = Field(default=None, ge=0, le=500_000)
    xl: Optional[int] = Field(default=None, ge=0, le=500_000)
    deaths: Optional[int] = Field(default=None, ge=0, le=100_000)
    egg_mass_g: Optional[float] = Field(default=None, ge=0, le=200)
    water_liters: Optional[float] = Field(default=None, ge=0, le=100_000)
    egg_type: Optional[EggTypeEnum] = None
    market_channel: Optional[MarketChannelEnum] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class DailyProductionRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    total_eggs: int
    broken: int
    small: int
    medium: int
    large: int
    xl: int
    deaths: int
    egg_mass_g: Optional[float]
    water_liters: Optional[float]
    egg_type: Optional[str]
    market_channel: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
