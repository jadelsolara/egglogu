"""API Key model for external programmatic access."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Boolean, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from src.models import Base
from src.models.base import TimestampMixin, TenantMixin


class APIKey(Base, TimestampMixin, TenantMixin):
    """API key for external system integration.

    Rate limits are enforced per key based on the organization's plan:
      - hobby: 100 req/hr
      - starter: 1,000 req/hr
      - pro: 10,000 req/hr
      - enterprise: unlimited
    """

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    key_prefix: Mapped[str] = mapped_column(String(8), index=True)  # First 8 chars for lookup
    key_hash: Mapped[str] = mapped_column(String(128), unique=True)  # SHA-256 of full key
    scopes: Mapped[list] = mapped_column(JSON, default=list)  # ["read:production", "write:production", ...]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    last_used_ip: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    total_requests: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    description: Mapped[Optional[str]] = mapped_column(String(500), default=None)
