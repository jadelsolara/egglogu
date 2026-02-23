import uuid
from datetime import date
from typing import Optional

from sqlalchemy import String, Integer, Date, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class Flock(TimestampMixin, TenantMixin, Base):
    __tablename__ = "flocks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    initial_count: Mapped[int] = mapped_column(Integer)
    current_count: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    breed: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    housing_type: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    target_curve: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    farm: Mapped["Farm"] = relationship(back_populates="flocks")  # noqa: F821
    breed_curves: Mapped[list["BreedCurve"]] = relationship(back_populates="flock")


class BreedCurve(TimestampMixin, TenantMixin, Base):
    __tablename__ = "breed_curves"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flocks.id", ondelete="CASCADE"), index=True)
    week: Mapped[int] = mapped_column(Integer)
    expected_pct: Mapped[float]
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    flock: Mapped[Flock] = relationship(back_populates="breed_curves")
