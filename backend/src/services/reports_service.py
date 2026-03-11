"""ReportsService — Gestión de reportes programados y ejecuciones."""

import uuid

from sqlalchemy import select, func

from src.core.exceptions import NotFoundError, ForbiddenError
from src.core.plans import get_plan_limits
from src.models.auth import User
from src.models.report import ReportSchedule, ReportExecution
from src.services.base import BaseService


class ReportsService(BaseService):
    """Operaciones CRUD tenant-scoped para reportes y sus programaciones."""

    # ── Validación de acceso por plan ─────────────────────────────────

    @staticmethod
    def check_report_access(user: User, template: str) -> None:
        """Validar acceso a reportes según el plan del usuario."""
        limits = get_plan_limits(user.plan)
        report_cfg = limits.get("reports", {})
        if not report_cfg:
            raise ForbiddenError(
                "Reports require Starter plan or higher. Upgrade to access."
            )
        allowed = report_cfg.get("templates", [])
        if allowed != "all" and template not in allowed:
            raise ForbiddenError(
                f"Report template '{template}' not available on your plan. "
                "Upgrade to access."
            )

    @staticmethod
    def check_scheduling_access(user: User, frequency: str) -> None:
        """Validar acceso a reportes programados según el plan del usuario."""
        limits = get_plan_limits(user.plan)
        report_cfg = limits.get("reports", {})
        scheduling = report_cfg.get("scheduling", [])
        if not scheduling:
            raise ForbiddenError(
                "Scheduled reports require Pro plan or higher. Upgrade to access."
            )
        if scheduling != "all" and frequency not in scheduling:
            raise ForbiddenError(
                f"Frequency '{frequency}' not available on your plan. "
                "Upgrade to access."
            )

    # ── Schedules ─────────────────────────────────────────────────────

    async def list_schedules(
        self, farm_id: uuid.UUID, *, page: int = 1, size: int = 50
    ) -> list:
        """Listar programaciones de reportes de una granja."""
        stmt = (
            self._scoped(ReportSchedule)
            .where(ReportSchedule.farm_id == farm_id)
            .order_by(ReportSchedule.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_schedule(self, schedule_id: uuid.UUID) -> ReportSchedule:
        """Obtener una programación de reporte por ID."""
        return await self._get(
            ReportSchedule, schedule_id, error_msg="Report schedule not found"
        )

    async def create_schedule(self, data, user: User) -> ReportSchedule:
        """Crear una programación de reporte, validando límites del plan."""
        self.check_report_access(user, data.template)
        self.check_scheduling_access(user, data.frequency)

        # Verificar límite de programaciones por plan
        limits = get_plan_limits(user.plan)
        report_cfg = limits.get("reports", {})
        max_schedules = report_cfg.get("max_schedules")
        if max_schedules is not None:
            count_stmt = select(func.count()).where(
                ReportSchedule.organization_id == self.org_id,
                ReportSchedule.farm_id == data.farm_id,
            )
            count = (await self.db.execute(count_stmt)).scalar() or 0
            if count >= max_schedules:
                raise ForbiddenError(
                    f"Limit reached: max {max_schedules} report schedules. "
                    "Upgrade your plan."
                )

        obj = ReportSchedule(
            **data.model_dump(),
            organization_id=self.org_id,
            created_by=self.user_id,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def update_schedule(
        self, schedule_id: uuid.UUID, data, user: User
    ) -> ReportSchedule:
        """Actualizar una programación de reporte existente."""
        obj = await self._get(
            ReportSchedule, schedule_id, error_msg="Report schedule not found"
        )

        update_data = data.model_dump(exclude_unset=True)
        if "template" in update_data:
            self.check_report_access(user, update_data["template"])
        if "frequency" in update_data:
            self.check_scheduling_access(user, update_data["frequency"])

        for key, value in update_data.items():
            setattr(obj, key, value)
        await self.db.flush()
        return obj

    async def delete_schedule(self, schedule_id: uuid.UUID) -> None:
        """Eliminar una programación de reporte."""
        obj = await self._get(
            ReportSchedule, schedule_id, error_msg="Report schedule not found"
        )
        await self.db.delete(obj)
        await self.db.flush()

    async def send_scheduled_report(
        self, schedule_id: uuid.UUID, user: User
    ) -> ReportExecution:
        """Ejecutar manualmente un reporte programado."""
        schedule = await self._get(
            ReportSchedule, schedule_id, error_msg="Report schedule not found"
        )

        from src.core.report_generator import execute_report

        return await execute_report(self.db, schedule, user)

    # ── Executions ────────────────────────────────────────────────────

    async def list_executions(
        self, farm_id: uuid.UUID, *, page: int = 1, size: int = 50
    ) -> list:
        """Listar ejecuciones de reportes de una granja."""
        stmt = (
            self._scoped(ReportExecution)
            .where(ReportExecution.farm_id == farm_id)
            .order_by(ReportExecution.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ── Ad-hoc generation ─────────────────────────────────────────────

    async def generate_adhoc(self, data, user: User) -> ReportExecution:
        """Generar un reporte ad-hoc (sin programación)."""
        self.check_report_access(user, data.template)

        from src.core.report_generator import generate_adhoc_report

        return await generate_adhoc_report(self.db, data, user)
