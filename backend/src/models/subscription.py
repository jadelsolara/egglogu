import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


class PlanTier(str, enum.Enum):
    free = "free"
    pro = "pro"
    business = "business"
    enterprise = "enterprise"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    cancelled = "cancelled"
    past_due = "past_due"


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"), unique=True, index=True
    )
    plan: Mapped[PlanTier] = mapped_column(default=PlanTier.free)
    status: Mapped[SubscriptionStatus] = mapped_column(default=SubscriptionStatus.active)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
