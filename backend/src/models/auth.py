import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin


class Role(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    vet = "vet"
    viewer = "viewer"


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    tier: Mapped[str] = mapped_column(String(20), default="free")

    users: Mapped[list["User"]] = relationship(back_populates="organization")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(128), default=None)
    full_name: Mapped[str] = mapped_column(String(200))
    oauth_provider: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    oauth_sub: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    role: Mapped[Role] = mapped_column(default=Role.viewer)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_token: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    reset_token: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None
    )

    # UTM tracking fields for conversion attribution
    utm_source: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    utm_medium: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    utm_campaign: Mapped[Optional[str]] = mapped_column(String(200), default=None)

    # Geolocation (detected at registration via IP)
    geo_country: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    geo_city: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    geo_region: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    geo_timezone: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    geo_lat: Mapped[Optional[float]] = mapped_column(default=None)
    geo_lng: Mapped[Optional[float]] = mapped_column(default=None)

    organization: Mapped[Organization] = relationship(back_populates="users")
