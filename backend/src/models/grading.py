import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    String, Float, Integer, Date, DateTime, Enum,
    ForeignKey, Text, Boolean
)
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class QualityGrade(str, enum.Enum):
    aa = "AA"
    a = "A"
    b = "B"
    reject = "reject"


class ShellCondition(str, enum.Enum):
    clean = "clean"
    dirty = "dirty"
    cracked = "cracked"
    broken = "broken"


class GradingSession(TimestampMixin, TenantMixin, Base):
    __tablename__ = "grading_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flocks.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    total_graded: Mapped[int] = mapped_column(Integer, default=0)
    grade_aa: Mapped[int] = mapped_column(Integer, default=0)
    grade_a: Mapped[int] = mapped_column(Integer, default=0)
    grade_b: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    dirty: Mapped[int] = mapped_column(Integer, default=0)
    cracked: Mapped[int] = mapped_column(Integer, default=0)
    avg_weight_g: Mapped[Optional[float]] = mapped_column(Float, default=None)
    shell_strength: Mapped[Optional[float]] = mapped_column(Float, default=None)
    haugh_unit: Mapped[Optional[float]] = mapped_column(Float, default=None)
    yolk_color_score: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    grader_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    machine_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
