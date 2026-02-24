import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.audit import AuditLog

logger = logging.getLogger("egglogu.audit")


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
    entry = AuditLog(
        user_id=user_id,
        organization_id=organization_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        changes=changes,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    logger.info(
        "AUDIT: %s %s/%s by user=%s org=%s",
        action, resource, resource_id, user_id, organization_id,
    )
