"""Plugin system models — registry of installed plugins per organization."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Boolean, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.models import Base
from src.models.base import TimestampMixin, TenantMixin


class Plugin(Base, TimestampMixin):
    """Plugin definition — metadata, permissions, hooks."""

    __tablename__ = "plugins"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[str] = mapped_column(String(20))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    author: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    hooks: Mapped[list] = mapped_column(JSON, default=list)  # ["on_production_entry", "on_alert", ...]
    permissions: Mapped[list] = mapped_column(JSON, default=list)  # ["read:production", "write:alerts"]
    config_schema: Mapped[Optional[dict]] = mapped_column(JSON, default=None)  # JSON Schema for plugin config
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)  # Visible in marketplace


class PluginInstall(Base, TimestampMixin, TenantMixin):
    """Plugin installation per organization — tracks config and status."""

    __tablename__ = "plugin_installs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plugin_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plugins.id", ondelete="CASCADE"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[Optional[dict]] = mapped_column(JSON, default=None)  # Plugin-specific config
    installed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    last_executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    execution_count: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text, default=None)
