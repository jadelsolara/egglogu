import uuid
from datetime import date, time, datetime
from typing import Optional

from pydantic import BaseModel


class EnvironmentReadingCreate(BaseModel):
    date: date
    time: Optional[time] = None
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    ammonia_ppm: Optional[float] = None
    light_lux: Optional[float] = None
    wind_speed: Optional[float] = None
    heat_stress_idx: Optional[float] = None
    notes: Optional[str] = None


class EnvironmentReadingUpdate(BaseModel):
    temp_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    ammonia_ppm: Optional[float] = None
    light_lux: Optional[float] = None
    wind_speed: Optional[float] = None
    heat_stress_idx: Optional[float] = None
    notes: Optional[str] = None


class EnvironmentReadingRead(BaseModel):
    id: uuid.UUID
    date: date
    time: Optional[time]
    temp_c: Optional[float]
    humidity_pct: Optional[float]
    ammonia_ppm: Optional[float]
    light_lux: Optional[float]
    wind_speed: Optional[float]
    heat_stress_idx: Optional[float]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IoTReadingCreate(BaseModel):
    timestamp: datetime
    sensor_type: str
    value: float
    unit: str


class IoTReadingUpdate(BaseModel):
    sensor_type: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None


class IoTReadingRead(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    sensor_type: str
    value: float
    unit: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WeatherCacheCreate(BaseModel):
    timestamp: datetime
    temp_c: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    forecast_json: Optional[dict] = None


class WeatherCacheUpdate(BaseModel):
    temp_c: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    forecast_json: Optional[dict] = None


class WeatherCacheRead(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    temp_c: Optional[float]
    humidity: Optional[float]
    wind_speed: Optional[float]
    description: Optional[str]
    icon: Optional[str]
    forecast_json: Optional[dict]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
