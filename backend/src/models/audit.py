"""Immutable Audit Log with hash-chain integrity (SOC 2 ready).

Each audit entry includes a SHA-256 hash of its contents plus the previous
entry's hash, forming a tamper-evident chain.  The audit_logs table should
have UPDATE and DELETE revoked for the application user so only INSERTs
are allowed.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Who
    user_id: Mapped[str] = mapped_column(String(50), index=True)
    organization_id: Mapped[str] = mapped_column(String(50), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(500), default=None)

    # What
    action: Mapped[str] = mapped_column(String(20), index=True)  # CREATE, UPDATE, DELETE
    table_name: Mapped[str] = mapped_column(String(100), index=True)
    record_id: Mapped[str] = mapped_column(String(50), index=True)

    # Changes
    old_values: Mapped[dict | None] = mapped_column(JSON, default=None)
    new_values: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Legacy field — kept for backward compat with existing queries
    resource: Mapped[str | None] = mapped_column(String(100), default=None)
    resource_id: Mapped[str | None] = mapped_column(String(50), default=None)
    changes: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Hash-chain fields for immutability verification
    hash: Mapped[str] = mapped_column(String(64), index=True)  # SHA-256 hex
    prev_hash: Mapped[str] = mapped_column(String(64), default="0" * 64)  # genesis = all zeros
