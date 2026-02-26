import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


class PriceTrend(str, enum.Enum):
    up = "up"
    down = "down"
    stable = "stable"


class MarketIntelligence(TimestampMixin, Base):
    __tablename__ = "market_intelligence"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_date: Mapped[date] = mapped_column(Date, index=True)
    region: Mapped[str] = mapped_column(String(100), index=True)
    egg_type: Mapped[str] = mapped_column(String(50))
    avg_price_per_unit: Mapped[float] = mapped_column(Float)
    total_production_units: Mapped[int] = mapped_column(Integer, default=0)
    demand_index: Mapped[float] = mapped_column(Float, default=0.0)
    supply_index: Mapped[float] = mapped_column(Float, default=0.0)
    price_trend: Mapped[PriceTrend] = mapped_column(default=PriceTrend.stable)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    source: Mapped[Optional[str]] = mapped_column(String(200), default=None)
