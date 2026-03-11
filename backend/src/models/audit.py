import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


class AuditLog(Base):
    """Append-only audit trail with hash-chain integrity.

    Uses string-based user_id/organization_id by design — audit logs must
    support system-level entries ("system", "platform") and survive even
    if the referenced user/org is deleted.
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    user_id: Mapped[str] = mapped_column(String(50), index=True)
    organization_id: Mapped[str] = mapped_column(String(50), index=True)
    action: Mapped[str] = mapped_column(String(20))  # CREATE, UPDATE, DELETE
    resource: Mapped[str] = mapped_column(String(100), index=True)
    resource_id: Mapped[str] = mapped_column(String(50))
    changes: Mapped[dict | None] = mapped_column(JSON, default=None)
    ip_address: Mapped[str | None] = mapped_column(String(50), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(500), default=None)

    # What
    table_name: Mapped[str] = mapped_column(String(100), index=True)
    record_id: Mapped[str] = mapped_column(String(50), index=True)

    # Changes
    old_values: Mapped[dict | None] = mapped_column(JSON, default=None)
    new_values: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Hash-chain fields for immutability verification
    hash: Mapped[str] = mapped_column(String(64), index=True)  # SHA-256 hex
    prev_hash: Mapped[str] = mapped_column(
        String(64), default="0" * 64
    )  # genesis = all zeros

    __table_args__ = (Index("ix_audit_org_timestamp", "organization_id", "timestamp"),)
