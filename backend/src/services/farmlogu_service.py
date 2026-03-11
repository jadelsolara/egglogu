"""FarmLogUService — Vista consolidada multi-vertical.

Proporciona analíticas cross-organización para holdings que operan
múltiples verticales, y gestión del registro de verticales.
"""

from typing import Any

from sqlalchemy import select, func

from src.services.base import BaseService
from src.models.auth import Organization
from src.models.finance import Income, Expense
from src.models.farm import Farm
from src.core.verticals import (
    Vertical,
    Feature,
    get_vertical,
    has_feature,
)


class FarmLogUService(BaseService):
    """Servicio de vista consolidada FarmLogU."""

    async def check_feature(self, feature: str) -> dict[str, Any]:
        """Verifica si una feature está habilitada para la organización actual.

        Args:
            feature: Código de la feature a verificar.

        Returns:
            Diccionario con feature, enabled, vertical y opcionalmente reason.
        """
        org = await self.db.get(Organization, self.org_id)
        if not org:
            return None  # Señal para que la ruta lance 404

        try:
            feat = Feature(feature)
            vert = Vertical(org.vertical)
        except ValueError:
            return {"feature": feature, "enabled": False, "reason": "unknown_feature"}

        enabled = has_feature(vert, feat)
        return {"feature": feature, "enabled": enabled, "vertical": org.vertical}

    async def get_consolidated_view(self) -> dict[str, Any] | None:
        """Vista financiera consolidada de todas las organizaciones del holding.

        Si la org del usuario es un holding (tiene child_orgs), muestra todas
        las hijas. Si pertenece a un holding, muestra todas las hermanas.
        De lo contrario, muestra solo la org del usuario.

        Returns:
            Diccionario con holding_name, organizations, totales y verticales,
            o None si la organización no existe.
        """
        org = await self.db.get(Organization, self.org_id)
        if not org:
            return None

        # Determinar qué orgs agregar
        if org.holding_id:
            holding = await self.db.get(Organization, org.holding_id)
            holding_name = holding.name if holding else org.name
            stmt = select(Organization).where(Organization.holding_id == org.holding_id)
        else:
            child_check = await self.db.execute(
                select(Organization.id)
                .where(Organization.holding_id == org.id)
                .limit(1)
            )
            if child_check.scalar_one_or_none():
                holding_name = org.name
                stmt = select(Organization).where(Organization.holding_id == org.id)
            else:
                holding_name = org.name
                stmt = select(Organization).where(Organization.id == org.id)

        result = await self.db.execute(stmt)
        orgs = result.scalars().all()

        summaries = []
        total_rev = 0.0
        total_exp = 0.0

        for o in orgs:
            summary = await self._build_org_summary(o)
            summaries.append(summary)
            total_rev += summary["total_revenue"]
            total_exp += summary["total_expenses"]

        active_verticals = list({s["vertical"] for s in summaries})

        return {
            "holding_name": holding_name,
            "organizations": summaries,
            "total_revenue": total_rev,
            "total_expenses": total_exp,
            "net_income": total_rev - total_exp,
            "verticals_active": active_verticals,
        }

    async def get_org_vertical(self) -> dict[str, Any] | None:
        """Obtiene la vertical y su configuración completa para la org actual.

        Returns:
            Diccionario con vertical y config, o None si no existe la org.
        """
        org = await self.db.get(Organization, self.org_id)
        if not org:
            return None

        try:
            v = get_vertical(Vertical(org.vertical))
        except (ValueError, KeyError):
            return {"vertical": org.vertical, "config": None}

        return {
            "vertical": org.vertical,
            "config": {
                "name": v.name,
                "product_name": v.product_name,
                "unit_name": v.unit_name,
                "unit_name_plural": v.unit_name_plural,
                "primary_unit_of_measure": v.primary_unit_of_measure,
                "icon": v.icon,
                "features": [f.value for f in v.features],
                "cost_categories": list(v.cost_categories),
                "kpi_metrics": list(v.kpi_metrics),
                "product_categories": list(v.product_categories),
            },
        }

    # ── Métodos internos ─────────────────────────────────────────────

    async def _build_org_summary(self, org: Organization) -> dict[str, Any]:
        """Construye el resumen financiero de una organización individual."""
        # Conteo de granjas
        farm_count_r = await self.db.execute(
            select(func.count(Farm.id)).where(Farm.organization_id == org.id)
        )
        farm_count = farm_count_r.scalar() or 0

        # Ingresos
        rev_r = await self.db.execute(
            select(func.coalesce(func.sum(Income.amount), 0.0)).where(
                Income.organization_id == org.id
            )
        )
        rev = float(rev_r.scalar())

        # Gastos
        exp_r = await self.db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
                Expense.organization_id == org.id
            )
        )
        exp = float(exp_r.scalar())

        # Info de vertical
        try:
            vc = get_vertical(Vertical(org.vertical))
            v_name = vc.name
            v_icon = vc.icon
        except (ValueError, KeyError):
            v_name = org.vertical
            v_icon = ""

        return {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "vertical": org.vertical,
            "vertical_name": v_name,
            "vertical_icon": v_icon,
            "tier": org.tier,
            "farm_count": farm_count,
            "total_revenue": rev,
            "total_expenses": exp,
            "net_income": rev - exp,
        }
