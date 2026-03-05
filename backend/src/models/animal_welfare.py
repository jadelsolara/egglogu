import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Integer, Float, Date, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class WelfareAssessment(TimestampMixin, TenantMixin, Base):
    __tablename__ = "welfare_assessments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flocks.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)

    # Welfare indicators (1-5 scale, 5 = excellent)
    plumage_score: Mapped[int] = mapped_column(Integer)
    mobility_score: Mapped[int] = mapped_column(Integer)
    behavior_score: Mapped[int] = mapped_column(Integer)

    # Environment indicators
    space_per_bird_sqm: Mapped[Optional[float]] = mapped_column(Float, default=None)
    nest_access: Mapped[Optional[bool]] = mapped_column(Boolean, default=None)
    perch_access: Mapped[Optional[bool]] = mapped_column(Boolean, default=None)
    lighting_hours: Mapped[Optional[float]] = mapped_column(Float, default=None)
    litter_condition_score: Mapped[Optional[int]] = mapped_column(Integer, default=None)

    # Health-adjacent welfare
    foot_pad_score: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    feather_pecking_observed: Mapped[bool] = mapped_column(Boolean, default=False)
    mortality_today: Mapped[int] = mapped_column(Integer, default=0)

    # Computed overall score (avg of the 3 main scores)
    overall_score: Mapped[float] = mapped_column(Float)

    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    # Data sharing consent (for aggregated academic data)
    share_anonymized: Mapped[bool] = mapped_column(Boolean, default=True)
