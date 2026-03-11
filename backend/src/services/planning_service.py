"""PlanningService — Planes de producción avícola."""

import uuid

from src.models.planning import ProductionPlan
from src.services.base import BaseService


class PlanningService(BaseService):
    """Operaciones CRUD para planes de producción."""

    async def list_plans(self, *, page: int = 1, size: int = 50) -> list:
        """Listar planes de producción."""
        return await self._list(ProductionPlan, page=page, size=size)

    async def get_plan(self, plan_id: uuid.UUID) -> ProductionPlan:
        """Obtener un plan de producción por ID."""
        return await self._get(
            ProductionPlan, plan_id, error_msg="Production plan not found"
        )

    async def create_plan(self, data) -> ProductionPlan:
        """Crear un nuevo plan de producción."""
        return await self._create(ProductionPlan, data)

    async def update_plan(self, plan_id: uuid.UUID, data) -> ProductionPlan:
        """Actualizar un plan de producción existente."""
        return await self._update(
            ProductionPlan, plan_id, data, error_msg="Production plan not found"
        )

    async def delete_plan(self, plan_id: uuid.UUID) -> None:
        """Eliminar un plan de producción."""
        await self._delete(
            ProductionPlan, plan_id, error_msg="Production plan not found"
        )
