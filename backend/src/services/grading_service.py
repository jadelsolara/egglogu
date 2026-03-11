"""GradingService — Sesiones de clasificación de huevos."""

import uuid

from src.models.grading import GradingSession
from src.services.base import BaseService


class GradingService(BaseService):
    """Operaciones CRUD para sesiones de clasificación (grading)."""

    async def list_sessions(self, *, page: int = 1, size: int = 50) -> list:
        """Listar sesiones de clasificación ordenadas por fecha descendente."""
        return await self._list(
            GradingSession, page=page, size=size, order_by=GradingSession.date.desc()
        )

    async def get_session(self, session_id: uuid.UUID) -> GradingSession:
        """Obtener una sesión de clasificación por ID."""
        return await self._get(
            GradingSession, session_id, error_msg="Grading session not found"
        )

    async def create_session(self, data) -> GradingSession:
        """Crear una nueva sesión de clasificación."""
        return await self._create(GradingSession, data)

    async def update_session(self, session_id: uuid.UUID, data) -> GradingSession:
        """Actualizar una sesión de clasificación existente."""
        return await self._update(
            GradingSession, session_id, data, error_msg="Grading session not found"
        )

    async def delete_session(self, session_id: uuid.UUID) -> None:
        """Eliminar una sesión de clasificación."""
        await self._delete(
            GradingSession, session_id, error_msg="Grading session not found"
        )
