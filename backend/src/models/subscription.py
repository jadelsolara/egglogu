import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


class PlanTier(str, enum.Enum):
    hobby = "hobby"
    starter = "starter"
    pro = "pro"
    enterprise = "enterprise"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    cancelled = "cancelled"
    past_due = "past_due"
    suspended = "suspended"


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, index=True
    )
    plan: Mapped[PlanTier] = mapped_column(default=PlanTier.enterprise)
    status: Mapped[SubscriptionStatus] = mapped_column(
        default=SubscriptionStatus.active
    )
    is_trial: Mapped[bool] = mapped_column(Boolean, default=True)
    trial_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    # Soft landing: quarterly discount phases
    # 0=trial, 1=Q1(40%off), 2=Q2(25%off), 3=Q3(15%off), 4=full price
    discount_phase: Mapped[int] = mapped_column(Integer, default=0)
    months_subscribed: Mapped[int] = mapped_column(Integer, default=0)
    billing_interval: Mapped[str] = mapped_column(
        String(10), default="month"
    )  # "month" or "year"
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(
        String(100), default=None
    )
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
