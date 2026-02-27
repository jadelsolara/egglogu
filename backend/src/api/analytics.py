import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.cache import get_cached, set_cached
from src.database import get_db
from src.models.auth import User
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

router = APIRouter(tags=["analytics"])


@router.get("/analytics/economics", response_model=EconomicsResponse)
async def get_economics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
    flock_id: Optional[uuid.UUID] = Query(default=None),
):
    org_id = user.organization_id

    # Check cache (TTL 5 min)
    cache_key = f"economics:{org_id}:{flock_id or 'all'}"
    cached = await get_cached(cache_key)
    if cached:
        return EconomicsResponse(**cached)

    # Fetch flocks
    flock_q = select(Flock).where(
        Flock.organization_id == org_id, Flock.is_active.is_(True)
    )
    if flock_id:
        flock_q = flock_q.where(Flock.id == flock_id)
    result = await db.execute(flock_q)
    flocks = result.scalars().all()

    # Global weighted avg feed price: SUM(total_cost) / SUM(kg)
    feed_price_result = await db.execute(
        select(func.sum(FeedPurchase.total_cost), func.sum(FeedPurchase.kg)).where(
            FeedPurchase.organization_id == org_id
        )
    )
    row = feed_price_result.one()
    total_feed_cost_global = row[0]
    total_feed_kg_global = row[1]
    avg_feed_price = (
        total_feed_cost_global / total_feed_kg_global
        if total_feed_cost_global and total_feed_kg_global and total_feed_kg_global > 0
        else None
    )

    # Total revenue for org
    rev_result = await db.execute(
        select(func.sum(Income.total)).where(Income.organization_id == org_id)
    )
    total_revenue = rev_result.scalar()

    # ── Pre-aggregate all cost data in 5 bulk queries (fixes N+1) ──

    flock_ids = [f.id for f in flocks]

    # 1. Feed kg per flock (FeedConsumption has flock_id)
    feed_agg = await db.execute(
        select(
            FeedConsumption.flock_id,
            func.sum(FeedConsumption.feed_kg).label("total_kg"),
        )
        .where(
            FeedConsumption.flock_id.in_(flock_ids),
            FeedConsumption.organization_id == org_id,
        )
        .group_by(FeedConsumption.flock_id)
    )
    feed_by_flock = {row.flock_id: row.total_kg for row in feed_agg}

    # 2. Vaccine costs per flock
    vax_agg = await db.execute(
        select(
            Vaccine.flock_id,
            func.sum(Vaccine.cost).label("total_cost"),
        )
        .where(
            Vaccine.flock_id.in_(flock_ids),
            Vaccine.organization_id == org_id,
            Vaccine.cost.isnot(None),
        )
        .group_by(Vaccine.flock_id)
    )
    vax_by_flock = {row.flock_id: row.total_cost for row in vax_agg}

    # 3. Medication costs per flock
    med_agg = await db.execute(
        select(
            Medication.flock_id,
            func.sum(Medication.cost).label("total_cost"),
        )
        .where(
            Medication.flock_id.in_(flock_ids),
            Medication.organization_id == org_id,
            Medication.cost.isnot(None),
        )
        .group_by(Medication.flock_id)
    )
    med_by_flock = {row.flock_id: row.total_cost for row in med_agg}

    # 4. Direct expenses per flock
    exp_agg = await db.execute(
        select(
            Expense.flock_id,
            func.sum(Expense.amount).label("total_amount"),
        )
        .where(
            Expense.flock_id.in_(flock_ids),
            Expense.organization_id == org_id,
            Expense.flock_id.isnot(None),
        )
        .group_by(Expense.flock_id)
    )
    exp_by_flock = {row.flock_id: row.total_amount for row in exp_agg}

    # 5. Total eggs per flock
    eggs_agg = await db.execute(
        select(
            DailyProduction.flock_id,
            func.sum(DailyProduction.total_eggs).label("total_eggs"),
        )
        .where(
            DailyProduction.flock_id.in_(flock_ids),
            DailyProduction.organization_id == org_id,
        )
        .group_by(DailyProduction.flock_id)
    )
    eggs_by_flock = {row.flock_id: row.total_eggs for row in eggs_agg}

    # ── Build per-flock results from pre-aggregated data ──

    flock_results: list[FlockEconomics] = []
    org_total_eggs = 0
    org_total_costs = 0.0
    org_total_investment = 0.0
    org_has_eggs = False
    org_has_costs = False

    today = date.today()

    for flock in flocks:
        days_active = max((today - flock.start_date).days, 1)

        # 1. Acquisition cost
        acquisition = None
        if flock.purchase_cost_per_bird is not None:
            acquisition = flock.purchase_cost_per_bird * flock.initial_count
            org_total_investment += acquisition

        # 2. Feed cost
        flock_feed_kg = feed_by_flock.get(flock.id)
        feed_cost = None
        if flock_feed_kg and avg_feed_price:
            feed_cost = round(flock_feed_kg * avg_feed_price, 2)

        # 3. Health costs
        vax_cost = vax_by_flock.get(flock.id)
        med_cost = med_by_flock.get(flock.id)
        health_cost = None
        if vax_cost is not None or med_cost is not None:
            health_cost = round((vax_cost or 0) + (med_cost or 0), 2)

        # 4. Direct expenses
        direct_expenses = exp_by_flock.get(flock.id)
        if direct_expenses is not None:
            direct_expenses = round(direct_expenses, 2)

        # 5. Total eggs
        total_eggs = eggs_by_flock.get(flock.id)
        if total_eggs is not None:
            total_eggs = int(total_eggs)
            org_total_eggs += total_eggs
            org_has_eggs = True

        # Compute total cost (only from components that have data)
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

        # 6. Derived metrics
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

    # ROI needs a second pass now that org_total_eggs is known
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

    # Org summary
    weighted_avg_cost = None
    if org_has_eggs and org_has_costs and org_total_eggs > 0:
        weighted_avg_cost = round(org_total_costs / org_total_eggs, 4)

    net_result = None
    if total_revenue is not None and org_has_costs:
        net_result = round(total_revenue - org_total_costs, 2)

    org_summary = OrgEconomicsSummary(
        total_eggs=org_total_eggs if org_has_eggs else None,
        weighted_avg_cost_per_egg=weighted_avg_cost,
        total_investment=org_total_investment if org_total_investment > 0 else None,
        total_costs=org_total_costs if org_has_costs else None,
        total_revenue=total_revenue,
        net_result=net_result,
    )

    response = EconomicsResponse(flocks=flock_results, org_summary=org_summary)

    # Cache the result for 5 minutes
    await set_cached(cache_key, response.model_dump(), ttl=300)

    return response
