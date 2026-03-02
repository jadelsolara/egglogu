import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Integer, Boolean, ForeignKey, Text, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin

import enum


class WorkflowTrigger(str, enum.Enum):
    data_change = "data_change"
    schedule = "schedule"
    threshold = "threshold"


class WorkflowRule(TimestampMixin, TenantMixin, Base):
    __tablename__ = "workflow_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    preset: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    trigger_type: Mapped[WorkflowTrigger] = mapped_column(SAEnum(WorkflowTrigger))
    conditions: Mapped[dict] = mapped_column(JSONB)
    actions: Mapped[dict] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=60)
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    execution_count: Mapped[int] = mapped_column(Integer, default=0)


class WorkflowExecution(TimestampMixin, TenantMixin, Base):
    __tablename__ = "workflow_executions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workflow_rules.id", ondelete="CASCADE"), index=True
    )
    farm_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE"), index=True
    )
    triggered_by: Mapped[str] = mapped_column(String(50))  # "system" | "manual" | user_id
    conditions_matched: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
    actions_executed: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    error: Mapped[Optional[str]] = mapped_column(Text, default=None)
