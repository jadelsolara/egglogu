import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db, get_read_db
from src.models.auth import User
from src.schemas.analytics import EconomicsResponse
from src.services.analytics_service import AnalyticsService

router = APIRouter(tags=["analytics"])


@router.get("/analytics/economics", response_model=EconomicsResponse)
async def get_economics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
    flock_id: Optional[uuid.UUID] = Query(default=None),
):
    svc = AnalyticsService(db, user.organization_id, user.id)
    return await svc.get_economics(flock_id=flock_id)


# ── CQRS Analytics (read from materialized views via read replica) ───


@router.get("/analytics/production/trends")
async def get_production_trends(
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(require_feature("analytics")),
    days: int = Query(30, ge=7, le=365),
):
    """Tendencias de producción diarias desde vista materializada (réplica de lectura)."""
    svc = AnalyticsService(db, user.organization_id, user.id)
    return await svc.get_production_trends(db, days=days)


@router.get("/analytics/flock/{flock_id}/weekly-kpi")
async def get_flock_weekly_kpi(
    flock_id: uuid.UUID,
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(require_feature("analytics")),
    weeks: int = Query(12, ge=1, le=52),
):
    """KPIs semanales agregados para un lote específico (réplica de lectura)."""
    svc = AnalyticsService(db, user.organization_id, user.id)
    return await svc.get_flock_weekly_kpi(db, flock_id, weeks=weeks)


@router.get("/analytics/flock/{flock_id}/fcr")
async def get_flock_fcr(
    flock_id: uuid.UUID,
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(require_feature("analytics")),
    weeks: int = Query(12, ge=1, le=52),
):
    """Ratio de conversión alimenticia (FCR) semanal para un lote (réplica de lectura)."""
    svc = AnalyticsService(db, user.organization_id, user.id)
    return await svc.get_flock_fcr(db, flock_id, weeks=weeks)


@router.get("/analytics/costs/monthly")
async def get_monthly_costs(
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(require_feature("finance")),
    flock_id: Optional[uuid.UUID] = Query(default=None),
    months: int = Query(6, ge=1, le=24),
):
    """Desglose mensual de costos desde vista materializada (réplica de lectura)."""
    svc = AnalyticsService(db, user.organization_id, user.id)
    return await svc.get_monthly_costs(db, flock_id=flock_id, months=months)


@router.get("/analytics/production/daily")
async def get_daily_production(
    db: AsyncSession = Depends(get_read_db),
    user: User = Depends(require_feature("analytics")),
    flock_id: Optional[uuid.UUID] = Query(default=None),
    days: int = Query(30, ge=1, le=365),
):
    """Detalle de producción diaria desde vista materializada (réplica de lectura)."""
    svc = AnalyticsService(db, user.organization_id, user.id)
    return await svc.get_daily_production(db, flock_id=flock_id, days=days)


@router.post("/analytics/refresh")
async def trigger_refresh(
    user: User = Depends(require_feature("analytics")),
    view: str | None = Query(
        default=None, description="Specific view to refresh, or all"
    ),
):
    """Admin: refrescar manualmente las vistas materializadas."""
    from src.tasks.analytics import (
        refresh_materialized_views,
        refresh_single_view,
        MATERIALIZED_VIEWS,
    )

    if view:
        if view not in MATERIALIZED_VIEWS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown view: {view}. Valid: {', '.join(MATERIALIZED_VIEWS)}",
            )
        refresh_single_view.delay(view)
        return {"status": "queued", "view": view}

    refresh_materialized_views.delay()
    return {"status": "queued", "views": MATERIALIZED_VIEWS}
