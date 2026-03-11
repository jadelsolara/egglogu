from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_role
from src.database import get_db
from src.models.auth import User
from src.services.audit_service import AuditService

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
    """Lista paginada de registros de auditoría con filtros opcionales."""
    svc = AuditService(db, user.organization_id, user.id)
    return await svc.list_logs(
        page=page, size=size, resource=resource,
        action=action, table_name=table_name,
    )


@router.get("/verify")
async def verify_chain_integrity(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("owner")),
):
    """Verifica la integridad del hash-chain de la pista de auditoría.

    Returns:
        - valid: True si toda la cadena está intacta, False si fue alterada
        - total_entries: Número de entradas verificadas
        - first_break_at: Índice del primer eslabón roto (None si es válida)
        - checked_at: Timestamp de la verificación
    """
    svc = AuditService(db, user.organization_id, user.id)
    return await svc.verify_chain()


@router.get("/stats")
async def audit_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("owner")),
):
    """Estadísticas de la pista de auditoría de la organización."""
    svc = AuditService(db, user.organization_id, user.id)
    return await svc.get_stats()
