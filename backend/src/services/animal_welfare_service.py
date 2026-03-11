"""AnimalWelfareService — Evaluaciones de bienestar animal."""

import uuid

from sqlalchemy import select, func, case

from src.models.animal_welfare import WelfareAssessment
from src.schemas.animal_welfare import WelfareStats
from src.services.base import BaseService


class AnimalWelfareService(BaseService):
    """Operaciones CRUD y estadísticas para evaluaciones de bienestar animal."""

    async def list_assessments(
        self,
        *,
        flock_id: uuid.UUID | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        """Listar evaluaciones de bienestar, opcionalmente filtradas por lote."""
        stmt = self._scoped(WelfareAssessment)
        if flock_id:
            stmt = stmt.where(WelfareAssessment.flock_id == flock_id)
        stmt = (
            stmt.order_by(WelfareAssessment.date.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_assessment(self, item_id: uuid.UUID) -> WelfareAssessment:
        """Obtener una evaluación de bienestar por ID."""
        return await self._get(
            WelfareAssessment, item_id, error_msg="Welfare assessment not found"
        )

    async def create_assessment(self, data) -> WelfareAssessment:
        """Crear una nueva evaluación de bienestar."""
        return await self._create(WelfareAssessment, data)

    async def update_assessment(self, item_id: uuid.UUID, data) -> WelfareAssessment:
        """Actualizar una evaluación y recalcular puntaje general si corresponde."""
        item = await self._get(
            WelfareAssessment, item_id, error_msg="Welfare assessment not found"
        )
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(item, key, value)
        # Recalcular overall_score si cambió algún puntaje parcial
        scores = [item.plumage_score, item.mobility_score, item.behavior_score]
        if all(s is not None for s in scores):
            item.overall_score = round(sum(scores) / 3, 2)
        await self.db.flush()
        return item

    async def delete_assessment(self, item_id: uuid.UUID) -> None:
        """Eliminar una evaluación de bienestar."""
        await self._delete(
            WelfareAssessment, item_id, error_msg="Welfare assessment not found"
        )

    async def get_stats(self, *, flock_id: uuid.UUID | None = None) -> WelfareStats:
        """Calcular estadísticas agregadas de bienestar animal."""
        stmt = select(
            func.count(WelfareAssessment.id).label("total"),
            func.avg(WelfareAssessment.overall_score).label("avg_overall"),
            func.avg(WelfareAssessment.plumage_score).label("avg_plumage"),
            func.avg(WelfareAssessment.mobility_score).label("avg_mobility"),
            func.avg(WelfareAssessment.behavior_score).label("avg_behavior"),
            func.avg(
                case(
                    (WelfareAssessment.feather_pecking_observed.is_(True), 1),
                    else_=0,
                )
            ).label("pecking_rate"),
            func.max(WelfareAssessment.date).label("latest"),
        ).where(WelfareAssessment.organization_id == self.org_id)
        if flock_id:
            stmt = stmt.where(WelfareAssessment.flock_id == flock_id)

        result = await self.db.execute(stmt)
        row = result.one()
        return WelfareStats(
            total_assessments=row.total or 0,
            avg_overall_score=round(row.avg_overall, 2) if row.avg_overall else None,
            avg_plumage=round(row.avg_plumage, 2) if row.avg_plumage else None,
            avg_mobility=round(row.avg_mobility, 2) if row.avg_mobility else None,
            avg_behavior=round(row.avg_behavior, 2) if row.avg_behavior else None,
            feather_pecking_rate=round(row.pecking_rate, 4)
            if row.pecking_rate
            else None,
            latest_date=row.latest,
        )
