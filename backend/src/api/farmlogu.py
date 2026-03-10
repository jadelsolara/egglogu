"""
FarmLogU Consolidated View — Multi-Vertical Dashboard

Provides cross-organization analytics for holdings that operate
multiple verticals (e.g., eggs + pigs + crops under one umbrella).

Also exposes the vertical registry so frontends know which features
to enable/disable per organization.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.auth import Organization, User
from src.models.finance import Income, Expense
from src.models.farm import Farm
from src.api.deps import get_current_user
from src.core.verticals import (
    Vertical, Feature, get_vertical, has_feature, all_verticals, VERTICALS,
)

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
    """Return all available verticals and their features."""
    result = []
    for v in all_verticals():
        result.append(VerticalInfo(
            code=v.code.value,
            name=v.name,
            product_name=v.product_name,
            unit_name=v.unit_name,
            primary_unit_of_measure=v.primary_unit_of_measure,
            icon=v.icon,
            features=[f.value for f in v.features],
            kpi_metrics=list(v.kpi_metrics),
        ))
    return result


@router.get("/verticals/{code}", response_model=VerticalInfo)
async def get_vertical_info(code: str):
    """Get configuration for a specific vertical."""
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
    """Check if a feature is available for the current user's organization vertical."""
    org = await db.get(Organization, user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
    try:
        feat = Feature(feature)
        vert = Vertical(org.vertical)
    except ValueError:
        return {"feature": feature, "enabled": False, "reason": "unknown_feature"}

    enabled = has_feature(vert, feat)
    return {"feature": feature, "enabled": enabled, "vertical": org.vertical}


@router.get("/consolidated", response_model=ConsolidatedView)
async def consolidated_view(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Consolidated financial view across all organizations in a holding.

    If the user's org is a holding (has child_orgs), shows all children.
    If the user's org belongs to a holding, shows all siblings.
    Otherwise, shows just the user's own org.
    """
    org = await db.get(Organization, user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")

    # Determine which orgs to aggregate
    if org.holding_id:
        # User's org belongs to a holding — get all sibling orgs
        holding = await db.get(Organization, org.holding_id)
        holding_name = holding.name if holding else org.name
        stmt = select(Organization).where(Organization.holding_id == org.holding_id)
    else:
        # Check if this org IS a holding (has children)
        child_check = await db.execute(
            select(Organization.id).where(Organization.holding_id == org.id).limit(1)
        )
        if child_check.scalar_one_or_none():
            holding_name = org.name
            stmt = select(Organization).where(Organization.holding_id == org.id)
        else:
            # Standalone org — just show itself
            holding_name = org.name
            stmt = select(Organization).where(Organization.id == org.id)

    result = await db.execute(stmt)
    orgs = result.scalars().all()

    summaries = []
    total_rev = 0.0
    total_exp = 0.0

    for o in orgs:
        # Farm count
        farm_count_r = await db.execute(
            select(func.count(Farm.id)).where(Farm.organization_id == o.id)
        )
        farm_count = farm_count_r.scalar() or 0

        # Revenue
        rev_r = await db.execute(
            select(func.coalesce(func.sum(Income.amount), 0.0)).where(
                Income.organization_id == o.id
            )
        )
        rev = float(rev_r.scalar())

        # Expenses
        exp_r = await db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
                Expense.organization_id == o.id
            )
        )
        exp = float(exp_r.scalar())

        # Vertical info
        try:
            vc = get_vertical(Vertical(o.vertical))
            v_name = vc.name
            v_icon = vc.icon
        except (ValueError, KeyError):
            v_name = o.vertical
            v_icon = ""

        summaries.append(OrgSummary(
            id=o.id,
            name=o.name,
            slug=o.slug,
            vertical=o.vertical,
            vertical_name=v_name,
            vertical_icon=v_icon,
            tier=o.tier,
            farm_count=farm_count,
            total_revenue=rev,
            total_expenses=exp,
            net_income=rev - exp,
        ))
        total_rev += rev
        total_exp += exp

    active_verticals = list({s.vertical for s in summaries})

    return ConsolidatedView(
        holding_name=holding_name,
        organizations=summaries,
        total_revenue=total_rev,
        total_expenses=total_exp,
        net_income=total_rev - total_exp,
        verticals_active=active_verticals,
    )


@router.get("/org/vertical")
async def get_org_vertical(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current organization's vertical and its full config."""
    org = await db.get(Organization, user.organization_id)
    if not org:
        raise HTTPException(404, "Organization not found")
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
