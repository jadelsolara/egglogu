import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Enum, Integer, String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class RiskLevel(str, enum.Enum):
    green = "green"
    yellow = "yellow"
    red = "red"


class PestType(str, enum.Enum):
    rodent = "rodent"
    fly = "fly"
    wild_bird = "wild_bird"
    other = "other"


class ProtocolFrequency(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class BiosecurityVisitor(TimestampMixin, TenantMixin, Base):
    __tablename__ = "biosecurity_visitors"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(200))
    company: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    purpose: Mapped[Optional[str]] = mapped_column(String(300), default=None)
    zone: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    vehicle_plate: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    disinfected: Mapped[bool] = mapped_column(Boolean, default=False)
    from_farm_health: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class BiosecurityZone(TimestampMixin, TenantMixin, Base):
    __tablename__ = "biosecurity_zones"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel), default=RiskLevel.green
    )
    last_disinfection: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    frequency_days: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class PestSighting(TimestampMixin, TenantMixin, Base):
    __tablename__ = "pest_sightings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[PestType] = mapped_column(Enum(PestType))
    location: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    severity: Mapped[int] = mapped_column(Integer, default=1)
    action: Mapped[Optional[str]] = mapped_column(Text, default=None)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class BiosecurityProtocol(TimestampMixin, TenantMixin, Base):
    __tablename__ = "biosecurity_protocols"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    frequency: Mapped[ProtocolFrequency] = mapped_column(
        Enum(ProtocolFrequency), default=ProtocolFrequency.daily
    )
    last_completed: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    items_json: Mapped[Optional[str]] = mapped_column(Text, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
