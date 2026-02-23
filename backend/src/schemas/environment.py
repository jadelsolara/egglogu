import uuid
from datetime import date, time, datetime
from typing import Optional

from pydantic import BaseModel, Field


class EnvironmentReadingCreate(BaseModel):
    date: date
    time: Optional[time] = None
    temp_c: Optional[float] = Field(default=None, ge=-50, le=70)
    humidity_pct: Optional[float] = Field(default=None, ge=0, le=100)
    ammonia_ppm: Optional[float] = Field(default=None, ge=0, le=500)
    light_lux: Optional[float] = Field(default=None, ge=0, le=200_000)
    wind_speed: Optional[float] = Field(default=None, ge=0, le=200)
    heat_stress_idx: Optional[float] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = Field(default=None, max_length=2000)


class EnvironmentReadingUpdate(BaseModel):
    temp_c: Optional[float] = Field(default=None, ge=-50, le=70)
    humidity_pct: Optional[float] = Field(default=None, ge=0, le=100)
    ammonia_ppm: Optional[float] = Field(default=None, ge=0, le=500)
    light_lux: Optional[float] = Field(default=None, ge=0, le=200_000)
    wind_speed: Optional[float] = Field(default=None, ge=0, le=200)
    heat_stress_idx: Optional[float] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = Field(default=None, max_length=2000)


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
    sensor_type: str = Field(min_length=1, max_length=100)
    value: float = Field(ge=-1000, le=1_000_000)
    unit: str = Field(min_length=1, max_length=20)


class IoTReadingUpdate(BaseModel):
    sensor_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    value: Optional[float] = Field(default=None, ge=-1000, le=1_000_000)
    unit: Optional[str] = Field(default=None, min_length=1, max_length=20)


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
    temp_c: Optional[float] = Field(default=None, ge=-90, le=60)
    humidity: Optional[float] = Field(default=None, ge=0, le=100)
    wind_speed: Optional[float] = Field(default=None, ge=0, le=300)
    description: Optional[str] = Field(default=None, max_length=200)
    icon: Optional[str] = Field(default=None, max_length=20)
    forecast_json: Optional[dict] = None


class WeatherCacheUpdate(BaseModel):
    temp_c: Optional[float] = Field(default=None, ge=-90, le=60)
    humidity: Optional[float] = Field(default=None, ge=0, le=100)
    wind_speed: Optional[float] = Field(default=None, ge=0, le=300)
    description: Optional[str] = Field(default=None, max_length=200)
    icon: Optional[str] = Field(default=None, max_length=20)
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
