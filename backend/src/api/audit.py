from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_role
from src.core.audit import verify_audit_chain
from src.database import get_db
from src.models.auth import User
from src.models.audit import AuditLog

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    resource: str = Query(None),
    action: str = Query(None),
    table_name: str = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("owner")),
):
    stmt = (
        select(AuditLog)
        .where(AuditLog.organization_id == str(user.organization_id))
        .order_by(AuditLog.timestamp.desc())
    )
    if resource:
        stmt = stmt.where(AuditLog.resource == resource)
    if table_name:
        stmt = stmt.where(AuditLog.table_name == table_name)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    # Get total count for pagination
    count_stmt = select(func.count(AuditLog.id)).where(
        AuditLog.organization_id == str(user.organization_id)
    )
    if resource:
        count_stmt = count_stmt.where(AuditLog.resource == resource)
    if table_name:
        count_stmt = count_stmt.where(AuditLog.table_name == table_name)
    if action:
        count_stmt = count_stmt.where(AuditLog.action == action)
    total = (await db.execute(count_stmt)).scalar()

    return {
        "items": [
            {
                "id": str(log.id),
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "user_id": log.user_id,
                "action": log.action,
                "table_name": log.table_name,
                "record_id": log.record_id,
                "old_values": log.old_values,
                "new_values": log.new_values,
                "resource": log.resource,
                "resource_id": log.resource_id,
                "changes": log.changes,
                "hash": log.hash,
                "prev_hash": log.prev_hash,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/verify")
async def verify_chain_integrity(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("owner")),
):
    """Verify the hash-chain integrity of the audit trail for this organization.

    Returns:
        - valid: True if the entire chain is intact, False if tampered
        - total_entries: Number of audit entries checked
        - first_break_at: Index of the first broken link (None if valid)
        - checked_at: Timestamp of the verification
    """
    result = await verify_audit_chain(db, str(user.organization_id))
    return result


@router.get("/stats")
async def audit_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("owner")),
):
    """Get audit trail statistics for this organization."""
    org_id = str(user.organization_id)

    total_stmt = select(func.count(AuditLog.id)).where(
        AuditLog.organization_id == org_id
    )
    total = (await db.execute(total_stmt)).scalar()

    # Count by action
    action_stmt = (
        select(AuditLog.action, func.count(AuditLog.id))
        .where(AuditLog.organization_id == org_id)
        .group_by(AuditLog.action)
    )
    action_counts = dict((await db.execute(action_stmt)).all())

    # Count by table
    table_stmt = (
        select(AuditLog.table_name, func.count(AuditLog.id))
        .where(AuditLog.organization_id == org_id)
        .where(AuditLog.table_name.isnot(None))
        .group_by(AuditLog.table_name)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_tables = dict((await db.execute(table_stmt)).all())

    return {
        "total_entries": total,
        "by_action": action_counts,
        "top_tables": top_tables,
    }
