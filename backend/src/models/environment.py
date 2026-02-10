import uuid
from datetime import date, time, datetime
from typing import Optional

from sqlalchemy import String, Float, Date, Time, DateTime, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class EnvironmentReading(TimestampMixin, TenantMixin, Base):
    __tablename__ = "environment_readings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date)
    time: Mapped[Optional[time]] = mapped_column(Time, default=None)
    temp_c: Mapped[Optional[float]] = mapped_column(Float, default=None)
    humidity_pct: Mapped[Optional[float]] = mapped_column(Float, default=None)
    ammonia_ppm: Mapped[Optional[float]] = mapped_column(Float, default=None)
    light_lux: Mapped[Optional[float]] = mapped_column(Float, default=None)
    wind_speed: Mapped[Optional[float]] = mapped_column(Float, default=None)
    heat_stress_idx: Mapped[Optional[float]] = mapped_column(Float, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class IoTReading(TimestampMixin, TenantMixin, Base):
    __tablename__ = "iot_readings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sensor_type: Mapped[str] = mapped_column(String(100))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50))


class WeatherCache(TimestampMixin, TenantMixin, Base):
    __tablename__ = "weather_cache"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    temp_c: Mapped[Optional[float]] = mapped_column(Float, default=None)
    humidity: Mapped[Optional[float]] = mapped_column(Float, default=None)
    wind_speed: Mapped[Optional[float]] = mapped_column(Float, default=None)
    description: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    icon: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    forecast_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
