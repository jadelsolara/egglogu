import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, Integer, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class DailyProduction(TimestampMixin, TenantMixin, Base):
    __tablename__ = "daily_production"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    total_eggs: Mapped[int] = mapped_column(Integer, default=0)
    broken: Mapped[int] = mapped_column(Integer, default=0)
    small: Mapped[int] = mapped_column(Integer, default=0)
    medium: Mapped[int] = mapped_column(Integer, default=0)
    large: Mapped[int] = mapped_column(Integer, default=0)
    xl: Mapped[int] = mapped_column(Integer, default=0)
    deaths: Mapped[int] = mapped_column(Integer, default=0)
    egg_mass_g: Mapped[Optional[float]] = mapped_column(Float, default=None)
    water_liters: Mapped[Optional[float]] = mapped_column(Float, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
