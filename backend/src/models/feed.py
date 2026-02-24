import uuid
from datetime import date
from typing import Optional

from sqlalchemy import String, Float, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class FeedPurchase(TimestampMixin, TenantMixin, Base):
    __tablename__ = "feed_purchases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date)
    brand: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    type: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    kg: Mapped[float] = mapped_column(Float)
    price_per_kg: Mapped[float] = mapped_column(Float)
    total_cost: Mapped[float] = mapped_column(Float)
    batch_code: Mapped[Optional[str]] = mapped_column(String(100), default=None)


class FeedConsumption(TimestampMixin, TenantMixin, Base):
    __tablename__ = "feed_consumption"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flocks.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    feed_kg: Mapped[float] = mapped_column(Float)
