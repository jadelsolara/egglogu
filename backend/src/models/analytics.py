import uuid
from datetime import date
from typing import Optional

from sqlalchemy import String, Float, Date, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class KPISnapshot(TimestampMixin, TenantMixin, Base):
    __tablename__ = "kpi_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    hen_day_pct: Mapped[Optional[float]] = mapped_column(Float, default=None)
    fcr: Mapped[Optional[float]] = mapped_column(Float, default=None)
    mortality_pct: Mapped[Optional[float]] = mapped_column(Float, default=None)
    avg_egg_weight: Mapped[Optional[float]] = mapped_column(Float, default=None)


class Prediction(TimestampMixin, TenantMixin, Base):
    __tablename__ = "predictions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    type: Mapped[str] = mapped_column(String(100))
    value_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
