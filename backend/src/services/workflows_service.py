"""WorkflowsService — Reglas, ejecuciones y evaluación de workflows."""

import uuid

from sqlalchemy import select, func

from src.core.exceptions import NotFoundError, ForbiddenError
from src.core.plans import get_plan_limits
from src.models.workflow import WorkflowRule, WorkflowExecution
from src.services.base import BaseService


class WorkflowsService(BaseService):
    """Operaciones CRUD y lógica de negocio para workflow rules y executions."""

    # ── Reglas ────────────────────────────────────────────────────────

    async def list_rules(
        self, farm_id: uuid.UUID, *, page: int = 1, size: int = 50
    ) -> list:
        """Lista reglas de workflow para una granja."""
        stmt = (
            self._scoped(WorkflowRule)
            .where(WorkflowRule.farm_id == farm_id)
            .order_by(WorkflowRule.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_rule(self, data) -> WorkflowRule:
        """Crea una nueva regla de workflow, validando el límite del plan."""
        count_stmt = select(func.count()).where(
            WorkflowRule.organization_id == self.org_id,
            WorkflowRule.farm_id == data.farm_id,
        )
        count = (await self.db.execute(count_stmt)).scalar() or 0
        await self._check_rule_limit(count)

        obj = WorkflowRule(
            **data.model_dump(),
            organization_id=self.org_id,
            created_by=self.user_id,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def get_rule(self, rule_id: uuid.UUID) -> WorkflowRule:
        """Obtiene una regla de workflow por ID."""
        return await self._get_rule_or_404(rule_id)

    async def update_rule(self, rule_id: uuid.UUID, data) -> WorkflowRule:
        """Actualiza una regla de workflow existente."""
        obj = await self._get_rule_or_404(rule_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        await self.db.flush()
        return obj

    async def delete_rule(self, rule_id: uuid.UUID) -> None:
        """Elimina una regla de workflow."""
        obj = await self._get_rule_or_404(rule_id)
        await self.db.delete(obj)
        await self.db.flush()

    async def toggle_rule(self, rule_id: uuid.UUID) -> WorkflowRule:
        """Alterna el estado activo/inactivo de una regla."""
        obj = await self._get_rule_or_404(rule_id)
        obj.is_active = not obj.is_active
        await self.db.flush()
        return obj

    async def test_rule(self, rule_id: uuid.UUID) -> dict:
        """Ejecuta una regla en modo dry-run (prueba sin acciones reales)."""
        obj = await self._get_rule_or_404(rule_id)

        from src.core.workflow_evaluator import evaluate_rule

        test_result = await evaluate_rule(self.db, obj, dry_run=True)
        return {
            "rule_id": str(rule_id),
            "would_trigger": test_result["matched"],
            "details": test_result,
        }

    # ── Evaluación masiva ─────────────────────────────────────────────

    async def evaluate_all(self, farm_id: uuid.UUID) -> dict:
        """Evalúa todas las reglas activas de una granja."""
        stmt = self._scoped(WorkflowRule).where(
            WorkflowRule.farm_id == farm_id,
            WorkflowRule.is_active == True,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        rules = result.scalars().all()

        from src.core.workflow_evaluator import evaluate_rule

        results = []
        for rule in rules:
            eval_result = await evaluate_rule(self.db, rule, dry_run=False)
            results.append(
                {
                    "rule_id": str(rule.id),
                    "name": rule.name,
                    "triggered": eval_result["matched"],
                }
            )
        return {"evaluated": len(results), "results": results}

    # ── Ejecuciones ───────────────────────────────────────────────────

    async def list_executions(
        self,
        farm_id: uuid.UUID,
        *,
        rule_id: uuid.UUID | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        """Lista ejecuciones de workflow para una granja."""
        stmt = (
            select(WorkflowExecution)
            .where(
                WorkflowExecution.organization_id == self.org_id,
                WorkflowExecution.farm_id == farm_id,
            )
            .order_by(WorkflowExecution.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        if rule_id:
            stmt = stmt.where(WorkflowExecution.rule_id == rule_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── Helpers internos ──────────────────────────────────────────────

    async def _get_rule_or_404(self, rule_id: uuid.UUID) -> WorkflowRule:
        """Obtiene una regla org-scoped o lanza NotFoundError."""
        stmt = select(WorkflowRule).where(
            WorkflowRule.id == rule_id,
            WorkflowRule.organization_id == self.org_id,
        )
        result = await self.db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError("Workflow rule not found")
        return obj

    async def _check_rule_limit(self, current_count: int) -> None:
        """Valida el límite de reglas según el plan contratado."""
        from src.api.deps import get_subscription, _resolve_plan

        sub = await get_subscription(self.org_id, self.db)
        plan = await _resolve_plan(sub, self.db)
        limits = get_plan_limits(plan)
        wf_cfg = limits.get("workflows", {})
        max_rules = wf_cfg.get("max_rules")
        if max_rules is not None and current_count >= max_rules:
            raise ForbiddenError(
                f"Limit reached: max {max_rules} workflow rules. Upgrade your plan."
            )
