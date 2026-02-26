from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_role
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
    if action:
        stmt = stmt.where(AuditLog.action == action)
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "user_id": log.user_id,
            "action": log.action,
            "resource": log.resource,
            "resource_id": log.resource_id,
            "changes": log.changes,
        }
        for log in logs
    ]
