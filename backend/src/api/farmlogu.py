"""
FarmLogU Consolidated View — Multi-Vertical Dashboard

Provides cross-organization analytics for holdings that operate
multiple verticals (e.g., eggs + pigs + crops under one umbrella).

Also exposes the vertical registry so frontends know which features
to enable/disable per organization.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.auth import User
from src.api.deps import get_current_user
from src.core.verticals import (
    Vertical,
    get_vertical,
    all_verticals,
)
from src.services.farmlogu_service import FarmLogUService

router = APIRouter(prefix="/farmlogu", tags=["farmlogu"])


# ── Schemas ──


class VerticalInfo(BaseModel):
    code: str
    name: str
    product_name: str
    unit_name: str
    primary_unit_of_measure: str
    icon: str
    features: list[str]
    kpi_metrics: list[str]


class OrgSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    vertical: str
    vertical_name: str
    vertical_icon: str
    tier: str
    farm_count: int
    total_revenue: float
    total_expenses: float
    net_income: float


class ConsolidatedView(BaseModel):
    holding_name: str
    organizations: list[OrgSummary]
    total_revenue: float
    total_expenses: float
    net_income: float
    verticals_active: list[str]


# ── Endpoints ──


@router.get("/verticals", response_model=list[VerticalInfo])
async def list_verticals():
    """Retorna todas las verticales disponibles y sus features."""
    result = []
    for v in all_verticals():
        result.append(
            VerticalInfo(
                code=v.code.value,
                name=v.name,
                product_name=v.product_name,
                unit_name=v.unit_name,
                primary_unit_of_measure=v.primary_unit_of_measure,
                icon=v.icon,
                features=[f.value for f in v.features],
                kpi_metrics=list(v.kpi_metrics),
            )
        )
    return result


@router.get("/verticals/{code}", response_model=VerticalInfo)
async def get_vertical_info(code: str):
    """Obtiene la configuración de una vertical específica."""
    try:
        v = get_vertical(Vertical(code))
    except (ValueError, KeyError):
        raise HTTPException(404, f"Vertical '{code}' not found")
    return VerticalInfo(
        code=v.code.value,
        name=v.name,
        product_name=v.product_name,
        unit_name=v.unit_name,
        primary_unit_of_measure=v.primary_unit_of_measure,
        icon=v.icon,
        features=[f.value for f in v.features],
        kpi_metrics=list(v.kpi_metrics),
    )


@router.get("/features/{feature}")
async def check_feature(
    feature: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verifica si una feature está disponible para la vertical de la organización."""
    svc = FarmLogUService(db, user.organization_id, user.id)
    result = await svc.check_feature(feature)
    if result is None:
        raise HTTPException(404, "Organization not found")
    return result


@router.get("/consolidated", response_model=ConsolidatedView)
async def consolidated_view(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Vista financiera consolidada de todas las organizaciones del holding.

    Si la org del usuario es un holding (tiene child_orgs), muestra todas
    las hijas. Si pertenece a un holding, muestra todas las hermanas.
    De lo contrario, muestra solo la org del usuario.
    """
    svc = FarmLogUService(db, user.organization_id, user.id)
    result = await svc.get_consolidated_view()
    if result is None:
        raise HTTPException(404, "Organization not found")
    return result


@router.get("/org/vertical")
async def get_org_vertical(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene la vertical de la organización actual y su configuración completa."""
    svc = FarmLogUService(db, user.organization_id, user.id)
    result = await svc.get_org_vertical()
    if result is None:
        raise HTTPException(404, "Organization not found")
    return result
