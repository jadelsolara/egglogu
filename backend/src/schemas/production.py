import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


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
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
