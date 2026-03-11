"""AnalyticsService — Analítica económica y consultas a vistas materializadas."""

import uuid
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.cache import get_cached, set_cached
from src.models.feed import FeedConsumption, FeedPurchase
from src.models.finance import Expense, Income
from src.models.flock import Flock
from src.models.health import Medication, Vaccine
from src.models.production import DailyProduction
from src.schemas.analytics import (
    CostBreakdown,
    DataCompleteness,
    EconomicsResponse,
    FlockEconomics,
    FlockMetrics,
    OrgEconomicsSummary,
)
from src.services.base import BaseService


class AnalyticsService(BaseService):
    """Servicio de analítica: económica, producción, costos y KPIs."""

    # ── Economics ─────────────────────────────────────────────────────

    async def get_economics(
        self, flock_id: Optional[uuid.UUID] = None
    ) -> EconomicsResponse:
        """Calcular métricas económicas por lote y resumen organizacional."""
        org_id = self.org_id

        # Cache (TTL 5 min)
        cache_key = f"economics:{org_id}:{flock_id or 'all'}"
        cached = await get_cached(cache_key)
        if cached:
            return EconomicsResponse(**cached)

        # Lotes activos
        flock_q = select(Flock).where(
            Flock.organization_id == org_id, Flock.is_active.is_(True)
        )
        if flock_id:
            flock_q = flock_q.where(Flock.id == flock_id)
        result = await self.db.execute(flock_q)
        flocks = result.scalars().all()

        # Precio promedio ponderado de alimento
        feed_price_result = await self.db.execute(
            select(
                func.sum(FeedPurchase.total_cost),
                func.sum(FeedPurchase.kg),
            ).where(
                FeedPurchase.organization_id == org_id,
                FeedPurchase.deleted_at.is_(None),
            )
        )
        row = feed_price_result.one()
        total_feed_cost_global, total_feed_kg_global = row[0], row[1]
        avg_feed_price = (
            total_feed_cost_global / total_feed_kg_global
            if total_feed_cost_global
            and total_feed_kg_global
            and total_feed_kg_global > 0
            else None
        )

        # Ingreso total de la organización
        rev_result = await self.db.execute(
            select(func.sum(Income.total)).where(Income.organization_id == org_id)
        )
        total_revenue = rev_result.scalar()

        # Pre-agregar datos de costos en 5 consultas bulk (evita N+1)
        flock_ids = [f.id for f in flocks]

        feed_by_flock = await self._aggregate_feed(flock_ids)
        vax_by_flock = await self._aggregate_vaccines(flock_ids)
        med_by_flock = await self._aggregate_medications(flock_ids)
        exp_by_flock = await self._aggregate_expenses(flock_ids)
        eggs_by_flock = await self._aggregate_eggs(flock_ids)

        # Construir resultados por lote
        flock_results, org_totals = self._build_flock_economics(
            flocks,
            avg_feed_price,
            total_revenue,
            feed_by_flock,
            vax_by_flock,
            med_by_flock,
            exp_by_flock,
            eggs_by_flock,
        )

        # Segunda pasada para ROI
        self._recalculate_roi(flock_results, org_totals, total_revenue)

        # Resumen organizacional
        org_summary = self._build_org_summary(org_totals, total_revenue)

        response = EconomicsResponse(flocks=flock_results, org_summary=org_summary)
        await set_cached(cache_key, response.model_dump(), ttl=300)
        return response

    # ── Agregaciones bulk (privadas) ──────────────────────────────────

    async def _aggregate_feed(self, flock_ids: list[uuid.UUID]) -> dict:
        """Kg de alimento consumido por lote."""
        result = await self.db.execute(
            select(
                FeedConsumption.flock_id,
                func.sum(FeedConsumption.feed_kg).label("total_kg"),
            )
            .where(
                FeedConsumption.flock_id.in_(flock_ids),
                FeedConsumption.organization_id == self.org_id,
            )
            .group_by(FeedConsumption.flock_id)
        )
        return {row.flock_id: row.total_kg for row in result}

    async def _aggregate_vaccines(self, flock_ids: list[uuid.UUID]) -> dict:
        """Costo de vacunas por lote."""
        result = await self.db.execute(
            select(
                Vaccine.flock_id,
                func.sum(Vaccine.cost).label("total_cost"),
            )
            .where(
                Vaccine.flock_id.in_(flock_ids),
                Vaccine.organization_id == self.org_id,
                Vaccine.cost.isnot(None),
            )
            .group_by(Vaccine.flock_id)
        )
        return {row.flock_id: row.total_cost for row in result}

    async def _aggregate_medications(self, flock_ids: list[uuid.UUID]) -> dict:
        """Costo de medicamentos por lote."""
        result = await self.db.execute(
            select(
                Medication.flock_id,
                func.sum(Medication.cost).label("total_cost"),
            )
            .where(
                Medication.flock_id.in_(flock_ids),
                Medication.organization_id == self.org_id,
                Medication.cost.isnot(None),
            )
            .group_by(Medication.flock_id)
        )
        return {row.flock_id: row.total_cost for row in result}

    async def _aggregate_expenses(self, flock_ids: list[uuid.UUID]) -> dict:
        """Gastos directos por lote."""
        result = await self.db.execute(
            select(
                Expense.flock_id,
                func.sum(Expense.amount).label("total_amount"),
            )
            .where(
                Expense.flock_id.in_(flock_ids),
                Expense.organization_id == self.org_id,
                Expense.flock_id.isnot(None),
            )
            .group_by(Expense.flock_id)
        )
        return {row.flock_id: row.total_amount for row in result}

    async def _aggregate_eggs(self, flock_ids: list[uuid.UUID]) -> dict:
        """Total de huevos por lote."""
        result = await self.db.execute(
            select(
                DailyProduction.flock_id,
                func.sum(DailyProduction.total_eggs).label("total_eggs"),
            )
            .where(
                DailyProduction.flock_id.in_(flock_ids),
                DailyProduction.organization_id == self.org_id,
            )
            .group_by(DailyProduction.flock_id)
        )
        return {row.flock_id: row.total_eggs for row in result}

    # ── Construcción de resultados ────────────────────────────────────

    @staticmethod
    def _build_flock_economics(
        flocks,
        avg_feed_price,
        total_revenue,
        feed_by_flock,
        vax_by_flock,
        med_by_flock,
        exp_by_flock,
        eggs_by_flock,
    ) -> tuple[list["FlockEconomics"], dict]:
        """Construir métricas económicas por lote a partir de datos pre-agregados."""
        flock_results: list[FlockEconomics] = []
        org_total_eggs = 0
        org_total_costs = 0.0
        org_total_investment = 0.0
        org_has_eggs = False
        org_has_costs = False
        today = date.today()

        for flock in flocks:
            days_active = max((today - flock.start_date).days, 1)

            # 1. Costo de adquisición
            acquisition = None
            if flock.purchase_cost_per_bird is not None:
                acquisition = flock.purchase_cost_per_bird * flock.initial_count
                org_total_investment += acquisition

            # 2. Costo de alimento
            flock_feed_kg = feed_by_flock.get(flock.id)
            feed_cost = None
            if flock_feed_kg and avg_feed_price:
                feed_cost = round(flock_feed_kg * avg_feed_price, 2)

            # 3. Costos de sanidad
            vax_cost = vax_by_flock.get(flock.id)
            med_cost = med_by_flock.get(flock.id)
            health_cost = None
            if vax_cost is not None or med_cost is not None:
                health_cost = round((vax_cost or 0) + (med_cost or 0), 2)

            # 4. Gastos directos
            direct_expenses = exp_by_flock.get(flock.id)
            if direct_expenses is not None:
                direct_expenses = round(direct_expenses, 2)

            # 5. Total de huevos
            total_eggs = eggs_by_flock.get(flock.id)
            if total_eggs is not None:
                total_eggs = int(total_eggs)
                org_total_eggs += total_eggs
                org_has_eggs = True

            # Costo total
            cost_components = [
                v for v in [feed_cost, health_cost, direct_expenses] if v is not None
            ]
            total_cost = round(sum(cost_components), 2) if cost_components else None

            total_cost_with_acq = total_cost
            if acquisition is not None:
                total_cost_with_acq = round((total_cost or 0) + acquisition, 2)

            if total_cost is not None or acquisition is not None:
                org_total_costs += total_cost_with_acq or 0
                org_has_costs = True

            # 6. Métricas derivadas
            cost_per_egg = None
            if total_cost is not None and total_eggs and total_eggs > 0:
                cost_per_egg = round(total_cost / total_eggs, 4)

            roi_per_bird = None
            if (
                flock.purchase_cost_per_bird
                and flock.purchase_cost_per_bird > 0
                and total_revenue is not None
                and total_cost_with_acq is not None
            ):
                if org_total_eggs > 0 and total_eggs and total_eggs > 0:
                    flock_revenue = total_revenue * (total_eggs / org_total_eggs)
                    roi_per_bird = round(
                        (flock_revenue - total_cost_with_acq)
                        / (flock.purchase_cost_per_bird * flock.initial_count),
                        2,
                    )

            daily_cost_per_bird = None
            if (
                total_cost_with_acq is not None
                and flock.current_count > 0
                and days_active > 0
            ):
                daily_cost_per_bird = round(
                    total_cost_with_acq / flock.current_count / days_active, 4
                )

            flock_results.append(
                FlockEconomics(
                    flock_id=flock.id,
                    flock_name=flock.name,
                    current_count=flock.current_count,
                    total_eggs=total_eggs,
                    days_active=days_active,
                    costs=CostBreakdown(
                        acquisition=acquisition,
                        feed=feed_cost,
                        health=health_cost,
                        direct_expenses=direct_expenses,
                        total=total_cost_with_acq,
                    ),
                    metrics=FlockMetrics(
                        cost_per_egg=cost_per_egg,
                        roi_per_bird=roi_per_bird,
                        daily_cost_per_bird=daily_cost_per_bird,
                    ),
                    data_completeness=DataCompleteness(
                        has_purchase_cost=flock.purchase_cost_per_bird is not None,
                        has_feed_data=feed_cost is not None,
                        has_health_costs=health_cost is not None,
                        has_direct_expenses=direct_expenses is not None,
                        has_production_data=total_eggs is not None and total_eggs > 0,
                    ),
                )
            )

        org_totals = {
            "org_total_eggs": org_total_eggs,
            "org_total_costs": org_total_costs,
            "org_total_investment": org_total_investment,
            "org_has_eggs": org_has_eggs,
            "org_has_costs": org_has_costs,
        }
        return flock_results, org_totals

    @staticmethod
    def _recalculate_roi(
        flock_results: list["FlockEconomics"],
        org_totals: dict,
        total_revenue,
    ) -> None:
        """Segunda pasada para ROI con org_total_eggs final."""
        org_total_eggs = org_totals["org_total_eggs"]
        if org_total_eggs > 0 and total_revenue:
            for fe in flock_results:
                if (
                    fe.metrics.roi_per_bird is None
                    and fe.costs.acquisition is not None
                    and fe.costs.acquisition > 0
                    and fe.total_eggs
                    and fe.total_eggs > 0
                    and fe.costs.total is not None
                ):
                    flock_revenue = total_revenue * (fe.total_eggs / org_total_eggs)
                    fe.metrics.roi_per_bird = round(
                        (flock_revenue - fe.costs.total) / fe.costs.acquisition, 2
                    )

    @staticmethod
    def _build_org_summary(org_totals: dict, total_revenue) -> OrgEconomicsSummary:
        """Construir resumen económico a nivel organización."""
        org_total_eggs = org_totals["org_total_eggs"]
        org_total_costs = org_totals["org_total_costs"]
        org_total_investment = org_totals["org_total_investment"]
        org_has_eggs = org_totals["org_has_eggs"]
        org_has_costs = org_totals["org_has_costs"]

        weighted_avg_cost = None
        if org_has_eggs and org_has_costs and org_total_eggs > 0:
            weighted_avg_cost = round(org_total_costs / org_total_eggs, 4)

        net_result = None
        if total_revenue is not None and org_has_costs:
            net_result = round(total_revenue - org_total_costs, 2)

        return OrgEconomicsSummary(
            total_eggs=org_total_eggs if org_has_eggs else None,
            weighted_avg_cost_per_egg=weighted_avg_cost,
            total_investment=org_total_investment if org_total_investment > 0 else None,
            total_costs=org_total_costs if org_has_costs else None,
            total_revenue=total_revenue,
            net_result=net_result,
        )

    # ── CQRS: Vistas materializadas (réplica de lectura) ─────────────

    async def get_production_trends(
        self, read_db: AsyncSession, *, days: int = 30
    ) -> dict:
        """Tendencias de producción diarias desde vista materializada."""
        since = date.today() - timedelta(days=days)
        result = await read_db.execute(
            text("""
                SELECT date, active_flocks, total_eggs, total_broken,
                       total_mortality, avg_egg_weight_g
                FROM mv_org_production_trends
                WHERE organization_id = :org_id AND date >= :since
                ORDER BY date
            """),
            {"org_id": str(self.org_id), "since": since},
        )
        rows = result.mappings().all()
        return {
            "org_id": str(self.org_id),
            "days": days,
            "data": [dict(r) for r in rows],
        }

    async def get_flock_weekly_kpi(
        self, read_db: AsyncSession, flock_id: uuid.UUID, *, weeks: int = 12
    ) -> dict:
        """KPIs semanales agregados para un lote específico."""
        since = date.today() - timedelta(weeks=weeks)
        result = await read_db.execute(
            text("""
                SELECT week_start, days_recorded, avg_hen_day_pct, total_eggs,
                       total_broken, total_mortality, avg_egg_weight_g
                FROM mv_weekly_kpi
                WHERE organization_id = :org_id
                  AND flock_id = :flock_id
                  AND week_start >= :since
                ORDER BY week_start
            """),
            {
                "org_id": str(self.org_id),
                "flock_id": str(flock_id),
                "since": since,
            },
        )
        rows = result.mappings().all()
        return {
            "flock_id": str(flock_id),
            "weeks": weeks,
            "data": [dict(r) for r in rows],
        }

    async def get_flock_fcr(
        self, read_db: AsyncSession, flock_id: uuid.UUID, *, weeks: int = 12
    ) -> dict:
        """Ratio de conversión alimenticia (FCR) semanal para un lote."""
        since = date.today() - timedelta(weeks=weeks)
        result = await read_db.execute(
            text("""
                SELECT week_start, feed_kg, egg_mass_kg, fcr
                FROM mv_flock_fcr
                WHERE organization_id = :org_id
                  AND flock_id = :flock_id
                  AND week_start >= :since
                ORDER BY week_start
            """),
            {
                "org_id": str(self.org_id),
                "flock_id": str(flock_id),
                "since": since,
            },
        )
        rows = result.mappings().all()
        return {
            "flock_id": str(flock_id),
            "weeks": weeks,
            "data": [dict(r) for r in rows],
        }

    async def get_monthly_costs(
        self,
        read_db: AsyncSession,
        *,
        flock_id: Optional[uuid.UUID] = None,
        months: int = 6,
    ) -> dict:
        """Desglose mensual de costos desde vista materializada."""
        since = date.today() - timedelta(days=months * 30)
        params: dict = {"org_id": str(self.org_id), "since": since}
        flock_filter = ""
        if flock_id:
            flock_filter = "AND flock_id = :flock_id"
            params["flock_id"] = str(flock_id)

        result = await read_db.execute(
            text(f"""
                SELECT flock_id, month_start, total_feed_kg, avg_feed_price_per_kg,
                       vaccine_cost, medication_cost, direct_expenses,
                       (total_feed_kg * avg_feed_price_per_kg + vaccine_cost +
                        medication_cost + direct_expenses) AS total_cost
                FROM mv_monthly_costs
                WHERE organization_id = :org_id
                  AND month_start >= :since
                  {flock_filter}
                ORDER BY month_start, flock_id
            """),
            params,
        )
        rows = result.mappings().all()
        return {
            "org_id": str(self.org_id),
            "months": months,
            "flock_id": str(flock_id) if flock_id else None,
            "data": [dict(r) for r in rows],
        }

    async def get_daily_production(
        self,
        read_db: AsyncSession,
        *,
        flock_id: Optional[uuid.UUID] = None,
        days: int = 30,
    ) -> dict:
        """Detalle de producción diaria desde vista materializada."""
        since = date.today() - timedelta(days=days)
        params: dict = {"org_id": str(self.org_id), "since": since}
        flock_filter = ""
        if flock_id:
            flock_filter = "AND flock_id = :flock_id"
            params["flock_id"] = str(flock_id)

        result = await read_db.execute(
            text(f"""
                SELECT flock_id, flock_name, date, total_eggs, broken_eggs,
                       mortality, current_count, hen_day_pct, avg_egg_weight_g
                FROM mv_daily_production_summary
                WHERE organization_id = :org_id
                  AND date >= :since
                  {flock_filter}
                ORDER BY date DESC, flock_id
            """),
            params,
        )
        rows = result.mappings().all()
        return {
            "org_id": str(self.org_id),
            "days": days,
            "flock_id": str(flock_id) if flock_id else None,
            "data": [dict(r) for r in rows],
        }
