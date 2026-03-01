"""CRM models — SuperAdmin customer relationship management."""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


# ── Enums ────────────────────────────────────────────────────────


class NoteType(str, enum.Enum):
    general = "general"
    call = "call"
    meeting = "meeting"
    escalation = "escalation"
    internal = "internal"


class RetentionTrigger(str, enum.Enum):
    churn_risk = "churn_risk"
    payment_failed = "payment_failed"
    low_usage = "low_usage"
    trial_ending = "trial_ending"
    downgrade_request = "downgrade_request"


class RetentionAction(str, enum.Enum):
    apply_discount = "apply_discount"
    send_email = "send_email"
    flag_for_review = "flag_for_review"


class CreditNoteStatus(str, enum.Enum):
    issued = "issued"
    void = "void"


# ── Models ───────────────────────────────────────────────────────


class CustomerNote(TimestampMixin, Base):
    """Superadmin notes attached to an organization."""

    __tablename__ = "customer_notes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text)
    note_type: Mapped[NoteType] = mapped_column(default=NoteType.general)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)


class ManualDiscount(TimestampMixin, Base):
    """Manual discounts applied by superadmin for retention."""

    __tablename__ = "manual_discounts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    applied_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    percent_off: Mapped[int] = mapped_column(Integer)  # 1-100
    duration_months: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str] = mapped_column(String(500))
    stripe_coupon_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )


class RetentionRule(TimestampMixin, Base):
    """Automated retention rules evaluated periodically."""

    __tablename__ = "retention_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    trigger_type: Mapped[RetentionTrigger] = mapped_column()
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)
    discount_percent: Mapped[int] = mapped_column(Integer, default=0)
    action_type: Mapped[RetentionAction] = mapped_column(
        default=RetentionAction.flag_for_review
    )
    email_template_key: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RetentionEvent(TimestampMixin, Base):
    """Log of retention actions executed against organizations."""

    __tablename__ = "retention_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("retention_rules.id", ondelete="SET NULL"), nullable=True
    )
    trigger_type: Mapped[RetentionTrigger] = mapped_column()
    action_taken: Mapped[str] = mapped_column(String(200))
    result: Mapped[Optional[str]] = mapped_column(String(500), default=None)


class CreditNote(TimestampMixin, Base):
    """Credit notes issued to organizations (linked to Stripe)."""

    __tablename__ = "credit_notes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    issued_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="usd")
    reason: Mapped[str] = mapped_column(String(500))
    stripe_credit_note_id: Mapped[Optional[str]] = mapped_column(
        String(100), default=None
    )
    status: Mapped[CreditNoteStatus] = mapped_column(default=CreditNoteStatus.issued)
