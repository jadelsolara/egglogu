"""Security models — login audit, sessions, 2FA, known devices."""

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


# ── Enums ────────────────────────────────────────────────────────


class LoginResult(str, enum.Enum):
    success = "success"
    bad_creds = "bad_creds"
    locked_out = "locked_out"
    needs_2fa = "needs_2fa"
    unverified = "unverified"
    disabled = "disabled"


class SessionStatus(str, enum.Enum):
    active = "active"
    revoked = "revoked"
    expired = "expired"


# ── Models ───────────────────────────────────────────────────────


class LoginAuditLog(TimestampMixin, Base):
    """Every login attempt — success or failure — with IP and device info."""

    __tablename__ = "login_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    email: Mapped[str] = mapped_column(String(320), index=True)
    result: Mapped[LoginResult] = mapped_column()
    ip_address: Mapped[str] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text, default=None)
    geo_country: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    geo_city: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    geo_lat: Mapped[Optional[float]] = mapped_column(Float, default=None)
    geo_lng: Mapped[Optional[float]] = mapped_column(Float, default=None)
    method: Mapped[str] = mapped_column(String(20), default="credentials")


class UserSession(TimestampMixin, Base):
    """Active sessions — one per device/login. Enables remote revocation."""

    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    refresh_token_jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text, default=None)
    device_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    geo_country: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    geo_city: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    status: Mapped[SessionStatus] = mapped_column(default=SessionStatus.active)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserTOTP(TimestampMixin, Base):
    """TOTP 2FA seed and backup codes per user."""

    __tablename__ = "user_totp"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    encrypted_seed: Mapped[str] = mapped_column(String(500))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    backup_codes_hash: Mapped[Optional[str]] = mapped_column(Text, default=None)
    backup_codes_used: Mapped[int] = mapped_column(Integer, default=0)


class KnownDevice(TimestampMixin, Base):
    """Fingerprint of known devices per user — for new-login alerts."""

    __tablename__ = "known_devices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    device_fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    ip_address: Mapped[str] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(Text, default=None)
    device_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    geo_country: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    geo_city: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
