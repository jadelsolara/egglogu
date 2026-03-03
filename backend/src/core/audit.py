"""Automatic audit trail capture with hash-chain integrity.

Provides two mechanisms:
1. SQLAlchemy event listeners on `after_flush` to auto-capture all changes
   to tenant-scoped models.
2. Manual `log_audit()` for cases where explicit context (user_id, ip) is needed.

The hash-chain ensures tamper evidence: each audit entry's SHA-256 hash
includes the previous entry's hash, forming an immutable linked chain.
"""

import hashlib
import json
import logging
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import event, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.models.audit import AuditLog

logger = logging.getLogger("egglogu.audit")

# Context vars set by middleware/deps per-request
audit_user_id: ContextVar[str | None] = ContextVar("audit_user_id", default=None)
audit_org_id: ContextVar[str | None] = ContextVar("audit_org_id", default=None)
audit_ip: ContextVar[str | None] = ContextVar("audit_ip", default=None)
audit_user_agent: ContextVar[str | None] = ContextVar("audit_user_agent", default=None)

# In-memory cache of the last hash for fast chain linking (per-org)
_last_hash_cache: dict[str, str] = {}
_GENESIS_HASH = "0" * 64


def _compute_hash(entry_data: dict, prev_hash: str) -> str:
    """Compute SHA-256 hash of audit entry data + previous hash."""
    payload = json.dumps(entry_data, sort_keys=True, default=str) + prev_hash
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _serialize_value(val: Any) -> Any:
    """Convert SQLAlchemy types to JSON-safe values."""
    if val is None:
        return None
    if isinstance(val, (uuid.UUID, datetime)):
        return str(val)
    if isinstance(val, bytes):
        return val.hex()
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, (int, float, bool, str)):
        return val
    return str(val)


def _get_model_changes(instance: Any) -> tuple[dict, dict]:
    """Extract old and new values for changed attributes."""
    mapper = inspect(type(instance))
    old_values = {}
    new_values = {}

    insp = inspect(instance)
    for attr in mapper.column_attrs:
        key = attr.key
        if key in ("created_at", "updated_at", "deleted_at"):
            continue
        hist = insp.attrs[key].history
        if hist.has_changes():
            old_val = hist.deleted[0] if hist.deleted else None
            new_val = hist.added[0] if hist.added else None
            old_values[key] = _serialize_value(old_val)
            new_values[key] = _serialize_value(new_val)

    return old_values, new_values


def _get_record_id(instance: Any) -> str:
    """Extract primary key as string."""
    mapper = inspect(type(instance))
    pk_cols = mapper.primary_key
    if len(pk_cols) == 1:
        return str(getattr(instance, pk_cols[0].key))
    return "|".join(str(getattr(instance, col.key)) for col in pk_cols)


def _get_org_id(instance: Any) -> str | None:
    """Try to get organization_id from the instance."""
    org_id = getattr(instance, "organization_id", None)
    if org_id is not None:
        return str(org_id)
    return audit_org_id.get()


def _get_prev_hash(org_id: str) -> str:
    """Get the last hash for this org's audit chain."""
    return _last_hash_cache.get(org_id, _GENESIS_HASH)


def _create_audit_entry(
    action: str,
    table_name: str,
    record_id: str,
    org_id: str | None,
    old_values: dict | None,
    new_values: dict | None,
) -> AuditLog:
    """Create an AuditLog entry with hash-chain linking."""
    user_id = audit_user_id.get() or "system"
    org = org_id or audit_org_id.get() or "unknown"
    ip = audit_ip.get()
    ua = audit_user_agent.get()

    prev_hash = _get_prev_hash(org)

    entry_data = {
        "action": action,
        "table_name": table_name,
        "record_id": record_id,
        "user_id": user_id,
        "organization_id": org,
        "old_values": old_values,
        "new_values": new_values,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    entry_hash = _compute_hash(entry_data, prev_hash)

    # Update cache
    _last_hash_cache[org] = entry_hash

    return AuditLog(
        user_id=user_id,
        organization_id=org,
        action=action,
        table_name=table_name,
        record_id=record_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip,
        user_agent=ua,
        resource=table_name,
        resource_id=record_id,
        changes=new_values,
        hash=entry_hash,
        prev_hash=prev_hash,
    )


# ── Tables to skip auditing ──
_SKIP_TABLES = frozenset({
    "audit_logs",
    "alembic_version",
})


def _should_audit(instance: Any) -> bool:
    """Check if this model instance should be audited."""
    table = getattr(instance, "__tablename__", None)
    if not table or table in _SKIP_TABLES:
        return False
    return True


# ── SQLAlchemy Event Listeners ──

def _after_flush_handler(session: Session, flush_context: Any) -> None:
    """Capture INSERT/UPDATE/DELETE events after flush."""
    audit_entries = []

    for instance in session.new:
        if not _should_audit(instance):
            continue
        try:
            table = instance.__tablename__
            record_id = _get_record_id(instance)
            org_id = _get_org_id(instance)

            mapper = inspect(type(instance))
            new_values = {}
            for attr in mapper.column_attrs:
                key = attr.key
                if key in ("created_at", "updated_at", "deleted_at"):
                    continue
                new_values[key] = _serialize_value(getattr(instance, key))

            entry = _create_audit_entry("CREATE", table, record_id, org_id, None, new_values)
            audit_entries.append(entry)
        except Exception as e:
            logger.warning("Audit CREATE failed for %s: %s", type(instance).__name__, e)

    for instance in session.dirty:
        if not _should_audit(instance):
            continue
        if not session.is_modified(instance, include_collections=False):
            continue
        try:
            table = instance.__tablename__
            record_id = _get_record_id(instance)
            org_id = _get_org_id(instance)
            old_values, new_values = _get_model_changes(instance)
            if not new_values:
                continue
            entry = _create_audit_entry("UPDATE", table, record_id, org_id, old_values, new_values)
            audit_entries.append(entry)
        except Exception as e:
            logger.warning("Audit UPDATE failed for %s: %s", type(instance).__name__, e)

    for instance in session.deleted:
        if not _should_audit(instance):
            continue
        try:
            table = instance.__tablename__
            record_id = _get_record_id(instance)
            org_id = _get_org_id(instance)

            mapper = inspect(type(instance))
            old_values = {}
            for attr in mapper.column_attrs:
                key = attr.key
                if key in ("created_at", "updated_at", "deleted_at"):
                    continue
                old_values[key] = _serialize_value(getattr(instance, key))

            entry = _create_audit_entry("DELETE", table, record_id, org_id, old_values, None)
            audit_entries.append(entry)
        except Exception as e:
            logger.warning("Audit DELETE failed for %s: %s", type(instance).__name__, e)

    for entry in audit_entries:
        session.add(entry)


def setup_audit_listeners() -> None:
    """Register the after_flush event listener. Call once at startup."""
    event.listen(Session, "after_flush", _after_flush_handler)
    logger.info("Audit trail listeners registered (hash-chain mode)")


async def initialize_hash_cache(db: AsyncSession) -> None:
    """Load the last hash per org from DB into memory. Call at startup."""
    try:
        stmt = (
            select(AuditLog.organization_id, AuditLog.hash)
            .distinct(AuditLog.organization_id)
            .order_by(AuditLog.organization_id, AuditLog.timestamp.desc())
        )
        result = await db.execute(stmt)
        for org_id, last_hash in result.all():
            _last_hash_cache[org_id] = last_hash
        logger.info("Audit hash cache initialized for %d organizations", len(_last_hash_cache))
    except Exception as e:
        logger.warning("Failed to initialize audit hash cache: %s", e)


async def verify_audit_chain(db: AsyncSession, organization_id: str) -> dict:
    """Verify the integrity of the audit hash chain for an organization."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.organization_id == organization_id)
        .order_by(AuditLog.timestamp.asc())
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()

    if not entries:
        return {
            "valid": True,
            "total_entries": 0,
            "first_break_at": None,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    prev_hash = _GENESIS_HASH
    first_break = None

    for i, entry in enumerate(entries):
        if entry.prev_hash != prev_hash:
            first_break = i
            break
        prev_hash = entry.hash

    return {
        "valid": first_break is None,
        "total_entries": len(entries),
        "first_break_at": first_break,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Legacy manual audit function (backward compat) ──

async def log_audit(
    db: AsyncSession,
    *,
    user_id: str,
    organization_id: str,
    action: str,
    resource: str,
    resource_id: str,
    changes: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Manual audit log entry with hash-chain. Backward-compatible API."""
    prev_hash = _get_prev_hash(organization_id)

    entry_data = {
        "action": action,
        "table_name": resource,
        "record_id": resource_id,
        "user_id": user_id,
        "organization_id": organization_id,
        "old_values": None,
        "new_values": changes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    entry_hash = _compute_hash(entry_data, prev_hash)
    _last_hash_cache[organization_id] = entry_hash

    entry = AuditLog(
        user_id=user_id,
        organization_id=organization_id,
        action=action,
        table_name=resource,
        record_id=resource_id,
        old_values=None,
        new_values=changes,
        resource=resource,
        resource_id=resource_id,
        changes=changes,
        ip_address=ip_address,
        user_agent=user_agent,
        hash=entry_hash,
        prev_hash=prev_hash,
    )
    db.add(entry)
    logger.info(
        "AUDIT: %s %s/%s by user=%s org=%s",
        action, resource, resource_id, user_id, organization_id,
    )
