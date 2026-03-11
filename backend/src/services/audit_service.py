"""AuditService — Consultas y verificación de la pista de auditoría.

Proporciona listado paginado, estadísticas y verificación de integridad
del hash-chain de auditoría por organización.
"""

import uuid
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.services.base import BaseService
from src.models.audit import AuditLog
from src.core.audit import verify_audit_chain


class AuditService(BaseService):
    """Servicio de auditoría con operaciones de lectura y verificación."""

    async def list_logs(
        self,
        *,
        page: int = 1,
        size: int = 50,
        resource: str | None = None,
        action: str | None = None,
        table_name: str | None = None,
    ) -> dict[str, Any]:
        """Lista paginada de registros de auditoría con filtros opcionales.

        Args:
            page: Número de página (1-based).
            size: Registros por página.
            resource: Filtro opcional por recurso.
            action: Filtro opcional por acción (CREATE, UPDATE, DELETE).
            table_name: Filtro opcional por nombre de tabla.

        Returns:
            Diccionario con items, total, page y size.
        """
        org_id = str(self.org_id)

        # Consulta principal
        stmt = (
            select(AuditLog)
            .where(AuditLog.organization_id == org_id)
            .order_by(AuditLog.timestamp.desc())
        )
        stmt = self._apply_filters(stmt, resource=resource, action=action,
                                    table_name=table_name)
        stmt = stmt.offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        logs = result.scalars().all()

        # Conteo total
        count_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.organization_id == org_id
        )
        count_stmt = self._apply_filters(count_stmt, resource=resource,
                                          action=action, table_name=table_name)
        total = (await self.db.execute(count_stmt)).scalar()

        return {
            "items": [self._log_to_dict(log) for log in logs],
            "total": total,
            "page": page,
            "size": size,
        }

    async def verify_chain(self) -> dict[str, Any]:
        """Verifica la integridad del hash-chain de auditoría.

        Returns:
            Diccionario con valid, total_entries, first_break_at y checked_at.
        """
        return await verify_audit_chain(self.db, str(self.org_id))

    async def get_stats(self) -> dict[str, Any]:
        """Obtiene estadísticas de la pista de auditoría.

        Returns:
            Diccionario con total_entries, by_action y top_tables.
        """
        org_id = str(self.org_id)

        total_stmt = select(func.count(AuditLog.id)).where(
            AuditLog.organization_id == org_id
        )
        total = (await self.db.execute(total_stmt)).scalar()

        # Conteo por acción
        action_stmt = (
            select(AuditLog.action, func.count(AuditLog.id))
            .where(AuditLog.organization_id == org_id)
            .group_by(AuditLog.action)
        )
        action_counts = dict((await self.db.execute(action_stmt)).all())

        # Top tablas por cantidad de registros
        table_stmt = (
            select(AuditLog.table_name, func.count(AuditLog.id))
            .where(AuditLog.organization_id == org_id)
            .where(AuditLog.table_name.isnot(None))
            .group_by(AuditLog.table_name)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        top_tables = dict((await self.db.execute(table_stmt)).all())

        return {
            "total_entries": total,
            "by_action": action_counts,
            "top_tables": top_tables,
        }

    # ── Métodos internos ─────────────────────────────────────────────

    @staticmethod
    def _apply_filters(stmt, *, resource=None, action=None, table_name=None):
        """Aplica filtros opcionales a una consulta de AuditLog."""
        if resource:
            stmt = stmt.where(AuditLog.resource == resource)
        if table_name:
            stmt = stmt.where(AuditLog.table_name == table_name)
        if action:
            stmt = stmt.where(AuditLog.action == action)
        return stmt

    @staticmethod
    def _log_to_dict(log: AuditLog) -> dict[str, Any]:
        """Serializa un registro de auditoría a diccionario."""
        return {
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
