"""Superadmin endpoints — platform-wide cross-tenant operations."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import get_current_user, require_superadmin
from src.core.exceptions import ForbiddenError, NotFoundError
from src.database import get_db
from src.models.audit import AuditLog
from src.models.auth import Organization, Role, User
from src.models.farm import Farm
from src.models.flock import Flock
from src.models.inventory import EggStock, StockMovement
from src.models.market_intelligence import MarketIntelligence, PriceTrend
from src.models.subscription import PlanTier, Subscription, SubscriptionStatus
from src.models.support import SupportRating, SupportTicket, TicketMessage, TicketStatus
from src.schemas.superadmin import (
    BulkDeleteRequest,
    ChurnAnalysis,
    ChurnDataPoint,
    GlobalInventoryItem,
    MarketIntelligenceCreate,
    MarketIntelligenceRead,
    MarketSummary,
    OrganizationDetail,
    OrganizationOverview,
    OrganizationPatch,
    PlatformStats,
    TicketOverview,
    UserOverview,
)

router = APIRouter(prefix="/superadmin", tags=["superadmin"])

SUPERADMIN = Depends(require_superadmin())


# ── Helpers ──────────────────────────────────────────────────────

async def _audit(
    db: AsyncSession,
    user: User,
    action: str,
    resource: str,
    resource_id: str,
    request: Request,
    changes: dict | None = None,
):
    log = AuditLog(
        user_id=str(user.id),
        organization_id="platform",
        action=action,
        resource=resource,
        resource_id=str(resource_id),
        changes=changes,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
    )
    db.add(log)
    await db.flush()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3E — Platform Stats (full KPIs)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/platform-stats", response_model=PlatformStats)
async def platform_stats(
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    d30 = now - timedelta(days=30)

    # Organizations
    total_orgs = (await db.execute(select(func.count(Organization.id)))).scalar() or 0
    # Active = has active subscription
    active_orgs = (
        await db.execute(
            select(func.count(distinct(Subscription.organization_id))).where(
                Subscription.status == SubscriptionStatus.active
            )
        )
    ).scalar() or 0

    # Users
    total_users = (
        await db.execute(
            select(func.count(User.id)).where(User.role != Role.superadmin)
        )
    ).scalar() or 0
    active_users = (
        await db.execute(
            select(func.count(User.id)).where(
                User.is_active.is_(True), User.role != Role.superadmin
            )
        )
    ).scalar() or 0

    # Farms + Flocks
    total_farms = (await db.execute(select(func.count(Farm.id)))).scalar() or 0
    total_flocks = (await db.execute(select(func.count(Flock.id)))).scalar() or 0

    # Inventory
    total_eggs = (
        await db.execute(select(func.coalesce(func.sum(EggStock.quantity), 0)))
    ).scalar() or 0

    # Tickets — comprehensive
    total_tickets = (
        await db.execute(select(func.count(SupportTicket.id)))
    ).scalar() or 0
    open_tickets = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.status.in_([
                    TicketStatus.open, TicketStatus.in_progress, TicketStatus.waiting_user
                ])
            )
        )
    ).scalar() or 0
    resolved_30d = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.resolved_at >= d30
            )
        )
    ).scalar() or 0
    bug_tickets = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(SupportTicket.category == "bug")
        )
    ).scalar() or 0
    feature_requests = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.category == "feature_request"
            )
        )
    ).scalar() or 0
    critical_tickets = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.priority == "critical",
                SupportTicket.status.in_([
                    TicketStatus.open, TicketStatus.in_progress
                ]),
            )
        )
    ).scalar() or 0

    # Avg resolution time (hours) for tickets resolved in last 90d
    res_times = (
        await db.execute(
            select(
                func.avg(
                    func.extract(
                        "epoch",
                        SupportTicket.resolved_at - SupportTicket.created_at,
                    )
                )
            ).where(
                SupportTicket.resolved_at.isnot(None),
                SupportTicket.resolved_at >= now - timedelta(days=90),
            )
        )
    ).scalar()
    avg_resolution_hours = round(res_times / 3600, 1) if res_times else None

    # Avg first-response time (hours) — time from ticket creation to first admin message
    first_responses = await db.execute(
        select(
            func.avg(
                func.extract(
                    "epoch",
                    func.min(TicketMessage.created_at) - SupportTicket.created_at,
                )
            )
        )
        .join(TicketMessage, TicketMessage.ticket_id == SupportTicket.id)
        .where(
            TicketMessage.is_admin.is_(True),
            SupportTicket.created_at >= now - timedelta(days=90),
        )
    )
    first_resp_avg = first_responses.scalar()
    ticket_response_avg_hours = round(first_resp_avg / 3600, 1) if first_resp_avg else None

    # SLA compliance (% tickets resolved before sla_deadline)
    sla_total_q = await db.execute(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.sla_deadline.isnot(None),
            SupportTicket.resolved_at.isnot(None),
        )
    )
    sla_total = sla_total_q.scalar() or 0
    sla_met_q = await db.execute(
        select(func.count(SupportTicket.id)).where(
            SupportTicket.sla_deadline.isnot(None),
            SupportTicket.resolved_at.isnot(None),
            SupportTicket.resolved_at <= SupportTicket.sla_deadline,
        )
    )
    sla_met = sla_met_q.scalar() or 0
    sla_compliance_pct = round((sla_met / sla_total) * 100, 1) if sla_total > 0 else None

    # Avg support rating
    avg_rating_q = await db.execute(select(func.avg(SupportRating.rating)))
    avg_rating = avg_rating_q.scalar()
    avg_support_rating = round(avg_rating, 2) if avg_rating else None

    # MRR estimation
    price_map = {"hobby": 9, "starter": 19, "pro": 49, "enterprise": 99}
    subs_result = await db.execute(
        select(Subscription.plan, func.count(Subscription.id)).where(
            Subscription.status == SubscriptionStatus.active
        ).group_by(Subscription.plan)
    )
    plan_dist = {}
    mrr = 0.0
    for plan, count in subs_result.all():
        plan_dist[plan.value] = count
        mrr += price_map.get(plan.value, 0) * count

    # New in last 30 days
    new_orgs_30d = (
        await db.execute(
            select(func.count(Organization.id)).where(Organization.created_at >= d30)
        )
    ).scalar() or 0
    new_users_30d = (
        await db.execute(
            select(func.count(User.id)).where(
                User.created_at >= d30, User.role != Role.superadmin
            )
        )
    ).scalar() or 0

    return PlatformStats(
        total_organizations=total_orgs,
        active_organizations=active_orgs,
        total_users=total_users,
        active_users=active_users,
        total_farms=total_farms,
        total_flocks=total_flocks,
        total_eggs_in_stock=total_eggs,
        open_tickets=open_tickets,
        resolved_tickets_30d=resolved_30d,
        avg_resolution_hours=avg_resolution_hours,
        total_tickets=total_tickets,
        bug_tickets=bug_tickets,
        feature_requests=feature_requests,
        critical_tickets=critical_tickets,
        mrr_estimated=mrr,
        plan_distribution=plan_dist,
        new_orgs_30d=new_orgs_30d,
        new_users_30d=new_users_30d,
        ticket_response_avg_hours=ticket_response_avg_hours,
        sla_compliance_pct=sla_compliance_pct,
        avg_support_rating=avg_support_rating,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3A — Global Inventory
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/inventory/overview", response_model=list[GlobalInventoryItem])
async def inventory_overview(
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    orgs = (await db.execute(select(Organization))).scalars().all()
    result = []
    for org in orgs:
        stocks = (
            await db.execute(
                select(EggStock).where(EggStock.organization_id == org.id)
            )
        ).scalars().all()

        total = sum(s.quantity for s in stocks)
        by_size: dict[str, int] = {}
        by_type: dict[str, int] = {}
        for s in stocks:
            by_size[s.egg_size] = by_size.get(s.egg_size, 0) + s.quantity
            if s.egg_type:
                by_type[s.egg_type] = by_type.get(s.egg_type, 0) + s.quantity

        last_mov = (
            await db.execute(
                select(func.max(StockMovement.date)).where(
                    StockMovement.organization_id == org.id
                )
            )
        ).scalar()

        result.append(
            GlobalInventoryItem(
                organization_id=org.id,
                organization_name=org.name,
                total_stock=total,
                stock_by_size=by_size,
                stock_by_type=by_type,
                last_movement_date=last_mov,
            )
        )
    return result


@router.get("/inventory/by-organization", response_model=list[dict])
async def inventory_by_org(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    stocks = (
        await db.execute(
            select(EggStock).where(EggStock.organization_id == org_id)
        )
    ).scalars().all()
    return [
        {
            "id": str(s.id),
            "egg_size": s.egg_size,
            "egg_type": s.egg_type,
            "quality_grade": s.quality_grade,
            "quantity": s.quantity,
            "date": str(s.date),
            "batch_code": s.batch_code,
            "best_before": str(s.best_before) if s.best_before else None,
        }
        for s in stocks
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3B — Tickets (cross-tenant)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/tickets", response_model=list[TicketOverview])
async def list_tickets(
    status: Optional[str] = None,
    org_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    q = select(SupportTicket).order_by(SupportTicket.created_at.desc())
    if status:
        q = q.where(SupportTicket.status == status)
    if org_id:
        q = q.where(SupportTicket.organization_id == org_id)
    if category:
        q = q.where(SupportTicket.category == category)
    if priority:
        q = q.where(SupportTicket.priority == priority)
    q = q.offset(offset).limit(limit)

    tickets = (await db.execute(q)).scalars().all()

    # Gather org names and user emails
    org_ids = {t.organization_id for t in tickets}
    user_ids = {t.user_id for t in tickets}
    orgs_map = {}
    if org_ids:
        orgs_res = await db.execute(
            select(Organization.id, Organization.name).where(Organization.id.in_(org_ids))
        )
        orgs_map = {r[0]: r[1] for r in orgs_res.all()}
    users_map = {}
    if user_ids:
        users_res = await db.execute(
            select(User.id, User.email).where(User.id.in_(user_ids))
        )
        users_map = {r[0]: r[1] for r in users_res.all()}

    return [
        TicketOverview(
            id=t.id,
            ticket_number=t.ticket_number,
            organization_id=t.organization_id,
            organization_name=orgs_map.get(t.organization_id),
            user_id=t.user_id,
            user_email=users_map.get(t.user_id),
            subject=t.subject,
            category=t.category.value,
            priority=t.priority.value,
            status=t.status.value,
            created_at=t.created_at,
            resolved_at=t.resolved_at,
            sla_deadline=t.sla_deadline,
        )
        for t in tickets
    ]


@router.delete("/tickets/{ticket_id}")
async def delete_ticket(
    ticket_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    ticket = (
        await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ).scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")

    await _audit(
        db, user, "DELETE", "support_ticket", str(ticket_id), request,
        changes={"ticket_number": ticket.ticket_number, "subject": ticket.subject},
    )
    await db.execute(delete(SupportTicket).where(SupportTicket.id == ticket_id))
    return {"detail": "Ticket deleted", "ticket_number": ticket.ticket_number}


@router.delete("/tickets/bulk")
async def bulk_delete_tickets(
    body: BulkDeleteRequest,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    tickets = (
        await db.execute(
            select(SupportTicket).where(SupportTicket.id.in_(body.ticket_ids))
        )
    ).scalars().all()

    deleted_numbers = []
    for t in tickets:
        await _audit(
            db, user, "DELETE", "support_ticket", str(t.id), request,
            changes={"ticket_number": t.ticket_number, "subject": t.subject},
        )
        deleted_numbers.append(t.ticket_number)

    await db.execute(
        delete(SupportTicket).where(SupportTicket.id.in_(body.ticket_ids))
    )
    return {"detail": f"{len(deleted_numbers)} tickets deleted", "ticket_numbers": deleted_numbers}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3C — Market Intelligence
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/market-intelligence", response_model=list[MarketIntelligenceRead])
async def list_market_intelligence(
    region: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    q = select(MarketIntelligence).order_by(MarketIntelligence.report_date.desc())
    if region:
        q = q.where(MarketIntelligence.region == region)
    if date_from:
        q = q.where(MarketIntelligence.report_date >= date_from)
    if date_to:
        q = q.where(MarketIntelligence.report_date <= date_to)
    q = q.offset(offset).limit(limit)

    items = (await db.execute(q)).scalars().all()
    return [MarketIntelligenceRead.model_validate(i) for i in items]


@router.post("/market-intelligence", response_model=MarketIntelligenceRead)
async def create_market_intelligence(
    body: MarketIntelligenceCreate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    entry = MarketIntelligence(
        report_date=body.report_date,
        region=body.region,
        egg_type=body.egg_type,
        avg_price_per_unit=body.avg_price_per_unit,
        total_production_units=body.total_production_units,
        demand_index=body.demand_index,
        supply_index=body.supply_index,
        price_trend=PriceTrend(body.price_trend),
        notes=body.notes,
        source=body.source,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    await _audit(
        db, user, "CREATE", "market_intelligence", str(entry.id), request,
        changes={"region": body.region, "egg_type": body.egg_type},
    )
    return MarketIntelligenceRead.model_validate(entry)


@router.get("/market-intelligence/summary", response_model=list[MarketSummary])
async def market_summary(
    months: int = Query(default=3, ge=1, le=24),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=months * 30)
    result = await db.execute(
        select(
            MarketIntelligence.region,
            func.avg(MarketIntelligence.avg_price_per_unit).label("avg_price"),
            func.sum(MarketIntelligence.total_production_units).label("total_prod"),
            func.avg(MarketIntelligence.demand_index).label("avg_demand"),
            func.avg(MarketIntelligence.supply_index).label("avg_supply"),
            func.count(MarketIntelligence.id).label("cnt"),
        )
        .where(MarketIntelligence.report_date >= cutoff)
        .group_by(MarketIntelligence.region)
    )
    summaries = []
    for row in result.all():
        # Determine dominant trend
        trends = await db.execute(
            select(MarketIntelligence.price_trend, func.count(MarketIntelligence.id))
            .where(
                MarketIntelligence.region == row[0],
                MarketIntelligence.report_date >= cutoff,
            )
            .group_by(MarketIntelligence.price_trend)
            .order_by(func.count(MarketIntelligence.id).desc())
            .limit(1)
        )
        dominant = trends.first()
        summaries.append(
            MarketSummary(
                region=row[0],
                avg_price=round(row[1], 2),
                total_production=row[2] or 0,
                avg_demand=round(row[3], 2),
                avg_supply=round(row[4], 2),
                dominant_trend=dominant[0].value if dominant else "stable",
                entries_count=row[5],
            )
        )
    return summaries


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3D — Organizations + Users + Churn
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/organizations", response_model=list[OrganizationOverview])
async def list_organizations(
    is_active: Optional[bool] = None,
    plan: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    q = select(Organization).order_by(Organization.created_at.desc())
    q = q.offset(offset).limit(limit)
    orgs = (await db.execute(q)).scalars().all()

    result = []
    for org in orgs:
        # User count
        uc = (
            await db.execute(
                select(func.count(User.id)).where(User.organization_id == org.id)
            )
        ).scalar() or 0
        # Farm count
        fc = (
            await db.execute(
                select(func.count(Farm.id)).where(Farm.organization_id == org.id)
            )
        ).scalar() or 0
        # Subscription
        sub = (
            await db.execute(
                select(Subscription).where(Subscription.organization_id == org.id)
            )
        ).scalar_one_or_none()
        # Last activity — most recent user created_at or ticket
        last_act = (
            await db.execute(
                select(func.max(User.updated_at)).where(User.organization_id == org.id)
            )
        ).scalar()

        # Check if active based on subscription
        org_is_active = True
        if sub and sub.status == SubscriptionStatus.suspended:
            org_is_active = False

        if is_active is not None and org_is_active != is_active:
            continue
        if plan and sub and sub.plan.value != plan:
            continue

        result.append(
            OrganizationOverview(
                id=org.id,
                name=org.name,
                slug=org.slug,
                tier=org.tier,
                plan=sub.plan.value if sub else None,
                plan_status=sub.status.value if sub else None,
                is_trial=sub.is_trial if sub else False,
                user_count=uc,
                farm_count=fc,
                created_at=org.created_at,
                is_active=org_is_active,
                last_activity=last_act,
            )
        )
    return result


@router.get("/organizations/{org_id}/details", response_model=OrganizationDetail)
async def organization_details(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    users = (
        await db.execute(select(User).where(User.organization_id == org_id))
    ).scalars().all()
    farms = (
        await db.execute(select(Farm).where(Farm.organization_id == org_id))
    ).scalars().all()
    flocks_count = (
        await db.execute(
            select(func.count(Flock.id)).where(Flock.organization_id == org_id)
        )
    ).scalar() or 0
    eggs = (
        await db.execute(
            select(func.coalesce(func.sum(EggStock.quantity), 0)).where(
                EggStock.organization_id == org_id
            )
        )
    ).scalar() or 0
    open_tix = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.organization_id == org_id,
                SupportTicket.status.in_([
                    TicketStatus.open, TicketStatus.in_progress
                ]),
            )
        )
    ).scalar() or 0
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()

    last_act = (
        await db.execute(
            select(func.max(User.updated_at)).where(User.organization_id == org_id)
        )
    ).scalar()

    org_is_active = True
    if sub and sub.status == SubscriptionStatus.suspended:
        org_is_active = False

    return OrganizationDetail(
        id=org.id,
        name=org.name,
        slug=org.slug,
        tier=org.tier,
        plan=sub.plan.value if sub else None,
        plan_status=sub.status.value if sub else None,
        is_trial=sub.is_trial if sub else False,
        user_count=len(users),
        farm_count=len(farms),
        created_at=org.created_at,
        is_active=org_is_active,
        last_activity=last_act,
        users=[
            {"id": str(u.id), "email": u.email, "name": u.full_name,
             "role": u.role.value, "active": u.is_active}
            for u in users
        ],
        farms=[
            {"id": str(f.id), "name": f.name}
            for f in farms
        ],
        subscription={
            "plan": sub.plan.value,
            "status": sub.status.value,
            "is_trial": sub.is_trial,
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
            "months_subscribed": sub.months_subscribed,
        } if sub else None,
        total_flocks=flocks_count,
        total_eggs_in_stock=eggs,
        open_tickets=open_tix,
    )


@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    await _audit(
        db, user, "DELETE", "organization", str(org_id), request,
        changes={"name": org.name, "slug": org.slug},
    )
    await db.delete(org)
    return {"detail": f"Organization '{org.name}' deleted"}


@router.patch("/organizations/{org_id}")
async def patch_organization(
    org_id: uuid.UUID,
    body: OrganizationPatch,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    changes = {}
    if body.is_active is not None:
        sub = (
            await db.execute(
                select(Subscription).where(Subscription.organization_id == org_id)
            )
        ).scalar_one_or_none()
        if sub:
            old_status = sub.status.value
            sub.status = (
                SubscriptionStatus.active if body.is_active
                else SubscriptionStatus.suspended
            )
            changes["status"] = {"from": old_status, "to": sub.status.value}

    await _audit(
        db, user, "UPDATE", "organization", str(org_id), request, changes=changes,
    )
    return {"detail": "Organization updated", "changes": changes}


# Users
@router.get("/users", response_model=list[UserOverview])
async def list_users(
    is_active: Optional[bool] = None,
    role: Optional[str] = None,
    org_id: Optional[uuid.UUID] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    q = select(User).where(User.role != Role.superadmin).order_by(User.created_at.desc())
    if is_active is not None:
        q = q.where(User.is_active == is_active)
    if role:
        q = q.where(User.role == role)
    if org_id:
        q = q.where(User.organization_id == org_id)
    q = q.offset(offset).limit(limit)

    users_list = (await db.execute(q)).scalars().all()

    # Org names
    org_ids = {u.organization_id for u in users_list if u.organization_id}
    orgs_map = {}
    if org_ids:
        orgs_res = await db.execute(
            select(Organization.id, Organization.name).where(
                Organization.id.in_(org_ids)
            )
        )
        orgs_map = {r[0]: r[1] for r in orgs_res.all()}

    return [
        UserOverview(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            organization_id=u.organization_id,
            organization_name=orgs_map.get(u.organization_id),
            is_active=u.is_active,
            email_verified=u.email_verified,
            created_at=u.created_at,
            geo_country=u.geo_country,
        )
        for u in users_list
    ]


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    if user_id == user.id:
        raise ForbiddenError("Cannot delete yourself")

    target = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not target:
        raise NotFoundError("User not found")
    if target.role == Role.superadmin:
        raise ForbiddenError("Cannot delete another superadmin")

    await _audit(
        db, user, "DELETE", "user", str(user_id), request,
        changes={"email": target.email, "name": target.full_name},
    )
    await db.delete(target)
    return {"detail": f"User '{target.email}' deleted"}


@router.patch("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    target = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not target:
        raise NotFoundError("User not found")
    if target.role == Role.superadmin:
        raise ForbiddenError("Cannot deactivate a superadmin")

    old_active = target.is_active
    target.is_active = not target.is_active

    await _audit(
        db, user, "UPDATE", "user", str(user_id), request,
        changes={"is_active": {"from": old_active, "to": target.is_active}},
    )
    return {
        "detail": f"User {'activated' if target.is_active else 'deactivated'}",
        "is_active": target.is_active,
    }


# Churn
@router.get("/churn-analysis", response_model=ChurnAnalysis)
async def churn_analysis(
    months: int = Query(default=6, ge=1, le=24),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    trend: list[ChurnDataPoint] = []
    churned_orgs = []

    for i in range(months - 1, -1, -1):
        month_start = (now - timedelta(days=i * 30)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1)

        # Orgs that existed at month start
        total = (
            await db.execute(
                select(func.count(Organization.id)).where(
                    Organization.created_at < month_end
                )
            )
        ).scalar() or 0

        # Orgs whose subscription was suspended in that month
        churned = (
            await db.execute(
                select(func.count(Subscription.id)).where(
                    Subscription.status == SubscriptionStatus.suspended,
                    Subscription.updated_at >= month_start,
                    Subscription.updated_at < month_end,
                )
            )
        ).scalar() or 0

        rate = round((churned / total) * 100, 2) if total > 0 else 0.0
        trend.append(
            ChurnDataPoint(
                month=month_start.strftime("%Y-%m"),
                churned=churned,
                total=total,
                churn_rate=rate,
            )
        )

    # Currently churned orgs
    suspended_subs = (
        await db.execute(
            select(Subscription, Organization.name)
            .join(Organization, Organization.id == Subscription.organization_id)
            .where(Subscription.status == SubscriptionStatus.suspended)
        )
    ).all()
    for sub, org_name in suspended_subs:
        churned_orgs.append({
            "organization_id": str(sub.organization_id),
            "name": org_name,
            "suspended_at": sub.updated_at.isoformat() if sub.updated_at else None,
            "was_trial": sub.is_trial,
        })

    latest_rate = trend[-1].churn_rate if trend else 0.0
    return ChurnAnalysis(
        monthly_churn_rate=latest_rate,
        retention_rate=round(100 - latest_rate, 2),
        churned_orgs=churned_orgs,
        trend=trend,
    )
