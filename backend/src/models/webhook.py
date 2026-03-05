"""Webhook model for outbound event notifications to external systems."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Boolean, Integer, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class Webhook(Base, TimestampMixin, TenantMixin):
    """Outbound webhook subscription — delivers events to external URLs."""

    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    url: Mapped[str] = mapped_column(String(2048))
    secret: Mapped[str] = mapped_column(String(256))  # HMAC-SHA256 signing secret
    events: Mapped[list] = mapped_column(
        JSON, default=list
    )  # ["production.new", "health.alert", ...]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    # Delivery stats
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0)
    total_failures: Mapped[int] = mapped_column(Integer, default=0)
    last_delivery_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )

    deliveries: Mapped[list["WebhookDelivery"]] = relationship(
        back_populates="webhook", cascade="all, delete-orphan"
    )


class WebhookDelivery(Base):
    """Log of individual webhook delivery attempts."""

    __tablename__ = "webhook_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    webhook_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("webhooks.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON)
    response_status: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    response_body: Mapped[Optional[str]] = mapped_column(Text, default=None)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    error: Mapped[Optional[str]] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    webhook: Mapped["Webhook"] = relationship(back_populates="deliveries")
