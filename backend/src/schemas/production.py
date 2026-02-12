import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


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
    total_eggs: int = 0
    broken: int = 0
    small: int = 0
    medium: int = 0
    large: int = 0
    xl: int = 0
    deaths: int = 0
    egg_mass_g: Optional[float] = None
    water_liters: Optional[float] = None
    egg_type: Optional[EggTypeEnum] = None
    market_channel: Optional[MarketChannelEnum] = None
    notes: Optional[str] = None


class DailyProductionUpdate(BaseModel):
    total_eggs: Optional[int] = None
    broken: Optional[int] = None
    small: Optional[int] = None
    medium: Optional[int] = None
    large: Optional[int] = None
    xl: Optional[int] = None
    deaths: Optional[int] = None
    egg_mass_g: Optional[float] = None
    water_liters: Optional[float] = None
    egg_type: Optional[EggTypeEnum] = None
    market_channel: Optional[MarketChannelEnum] = None
    notes: Optional[str] = None


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
