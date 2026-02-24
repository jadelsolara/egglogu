import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, Enum, Integer, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class EggType(str, enum.Enum):
    conventional = "conventional"
    free_range = "free_range"
    organic = "organic"
    pasture_raised = "pasture_raised"
    decorative = "decorative"


class MarketChannel(str, enum.Enum):
    wholesale = "wholesale"
    supermarket = "supermarket"
    restaurant = "restaurant"
    direct = "direct"
    export = "export"
    pasteurized = "pasteurized"


class DailyProduction(TimestampMixin, TenantMixin, Base):
    __tablename__ = "daily_production"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flocks.id", ondelete="CASCADE"), index=True
    )
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
    egg_type: Mapped[Optional[EggType]] = mapped_column(Enum(EggType), default=None)
    market_channel: Mapped[Optional[MarketChannel]] = mapped_column(
        Enum(MarketChannel), default=None
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
