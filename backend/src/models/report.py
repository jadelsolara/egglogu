import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Boolean, ForeignKey, Text, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin

import enum


class ReportFrequency(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class ReportTemplate(str, enum.Enum):
    production = "production"
    financial = "financial"
    health = "health"
    feed = "feed"
    kpi = "kpi"


class ReportSchedule(TimestampMixin, TenantMixin, Base):
    __tablename__ = "report_schedules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(200))
    template: Mapped[ReportTemplate] = mapped_column(SAEnum(ReportTemplate))
    frequency: Mapped[ReportFrequency] = mapped_column(SAEnum(ReportFrequency))
    recipients: Mapped[Optional[str]] = mapped_column(
        Text, default=None
    )  # comma-separated emails
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    params: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
    last_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    next_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )


class ReportExecution(TimestampMixin, TenantMixin, Base):
    __tablename__ = "report_executions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("report_schedules.id", ondelete="SET NULL"), default=None, index=True
    )
    farm_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    template: Mapped[ReportTemplate] = mapped_column(SAEnum(ReportTemplate))
    triggered_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    status: Mapped[str] = mapped_column(String(20), default="completed")
    recipients_sent: Mapped[Optional[str]] = mapped_column(Text, default=None)
    error: Mapped[Optional[str]] = mapped_column(Text, default=None)
    result_summary: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
