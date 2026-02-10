import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import String, Integer, Date, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class Vaccine(TimestampMixin, TenantMixin, Base):
    __tablename__ = "vaccines"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    name: Mapped[str] = mapped_column(String(200))
    method: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class Medication(TimestampMixin, TenantMixin, Base):
    __tablename__ = "medications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    name: Mapped[str] = mapped_column(String(200))
    dosage: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    duration_days: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class Outbreak(TimestampMixin, TenantMixin, Base):
    __tablename__ = "outbreaks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    disease: Mapped[str] = mapped_column(String(200))
    affected_count: Mapped[int] = mapped_column(Integer, default=0)
    deaths: Mapped[int] = mapped_column(Integer, default=0)
    treatment: Mapped[Optional[str]] = mapped_column(Text, default=None)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)


class StressType(str, enum.Enum):
    heat = "heat"
    cold = "cold"
    noise = "noise"
    predator = "predator"
    handling = "handling"
    other = "other"


class StressEvent(TimestampMixin, TenantMixin, Base):
    __tablename__ = "stress_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[StressType]
    severity: Mapped[int] = mapped_column(Integer)
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
