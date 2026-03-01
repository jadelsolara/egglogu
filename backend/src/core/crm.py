"""CRM business logic — health score, LTV, retention engine."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.auth import Organization, User
from src.models.crm import RetentionEvent, RetentionRule
from src.models.farm import Farm
from src.models.flock import Flock
from src.models.production import DailyProduction
from src.models.subscription import PlanTier, Subscription, SubscriptionStatus
from src.models.support import SupportTicket, TicketStatus

# ── Price map for LTV calculation ─────────────────────────────────
PLAN_MONTHLY_PRICE = {
    "hobby": 9,
    "starter": 19,
    "pro": 49,
    "enterprise": 99,
}


async def compute_health_score(org_id, db: AsyncSession) -> dict:
    """
    Health score 0–100 based on:
      - Login recency (last user activity)      → 25 pts
      - Production records (last 30d)            → 25 pts
      - Payment failures (past_due status)       → 25 pts
      - Farm/flock count (engagement depth)      → 15 pts
      - Open tickets (negative signal)           → 10 pts
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    d30 = now - timedelta(days=30)
    d7 = now - timedelta(days=7)

    # 1) Login recency — last user updated_at
    last_activity = (
        await db.execute(
            select(func.max(User.updated_at)).where(User.organization_id == org_id)
        )
    ).scalar()

    if last_activity and last_activity >= d7:
        login_score = 25  # Active in last 7 days
    elif last_activity and last_activity >= d30:
        login_score = 15  # Active in last 30 days
    elif last_activity:
        days_ago = (now - last_activity).days
        login_score = max(0, 25 - days_ago // 3)  # Decays
    else:
        login_score = 0

    # 2) Production records in last 30 days
    prod_count = (
        await db.execute(
            select(func.count(DailyProduction.id)).where(
                DailyProduction.organization_id == org_id,
                DailyProduction.created_at >= d30,
            )
        )
    ).scalar() or 0

    if prod_count >= 20:
        prod_score = 25
    elif prod_count >= 10:
        prod_score = 20
    elif prod_count >= 5:
        prod_score = 15
    elif prod_count >= 1:
        prod_score = 10
    else:
        prod_score = 0

    # 3) Payment status
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()

    if not sub or sub.status == SubscriptionStatus.suspended:
        payment_score = 0
    elif sub.status == SubscriptionStatus.past_due:
        payment_score = 5
    elif sub.status == SubscriptionStatus.cancelled:
        payment_score = 10
    else:
        payment_score = 25  # active

    # 4) Farm + Flock depth
    farm_count = (
        await db.execute(
            select(func.count(Farm.id)).where(Farm.organization_id == org_id)
        )
    ).scalar() or 0
    flock_count = (
        await db.execute(
            select(func.count(Flock.id)).where(Flock.organization_id == org_id)
        )
    ).scalar() or 0

    depth = farm_count + flock_count
    if depth >= 10:
        depth_score = 15
    elif depth >= 5:
        depth_score = 12
    elif depth >= 2:
        depth_score = 8
    elif depth >= 1:
        depth_score = 5
    else:
        depth_score = 0

    # 5) Open tickets (negative signal)
    open_tickets = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.organization_id == org_id,
                SupportTicket.status.in_([TicketStatus.open, TicketStatus.in_progress]),
            )
        )
    ).scalar() or 0

    if open_tickets == 0:
        ticket_score = 10
    elif open_tickets <= 2:
        ticket_score = 7
    elif open_tickets <= 5:
        ticket_score = 3
    else:
        ticket_score = 0

    total = login_score + prod_score + payment_score + depth_score + ticket_score

    # Risk classification
    if total >= 75:
        risk = "low"
    elif total >= 50:
        risk = "medium"
    elif total >= 25:
        risk = "high"
    else:
        risk = "critical"

    return {
        "score": total,
        "risk": risk,
        "breakdown": {
            "login_recency": login_score,
            "production_activity": prod_score,
            "payment_health": payment_score,
            "engagement_depth": depth_score,
            "ticket_burden": ticket_score,
        },
        "last_activity": last_activity.isoformat() if last_activity else None,
    }


async def compute_ltv(org_id, db: AsyncSession) -> dict:
    """Compute customer lifetime value from subscription history."""
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()

    if not sub:
        return {"ltv": 0, "months": 0, "plan": None, "monthly_rate": 0}

    plan_name = sub.plan.value if isinstance(sub.plan, PlanTier) else sub.plan
    monthly_rate = PLAN_MONTHLY_PRICE.get(plan_name, 0)
    months = max(sub.months_subscribed, 1)
    ltv = monthly_rate * months

    return {
        "ltv": ltv,
        "months": months,
        "plan": plan_name,
        "monthly_rate": monthly_rate,
    }


async def evaluate_retention_rules(db: AsyncSession) -> list[dict]:
    """Evaluate all active retention rules against all organizations.

    Returns list of events triggered.
    """
    rules = (
        await db.execute(
            select(RetentionRule).where(RetentionRule.is_active.is_(True))
        )
    ).scalars().all()

    if not rules:
        return []

    orgs = (await db.execute(select(Organization))).scalars().all()
    triggered = []

    for org in orgs:
        sub = (
            await db.execute(
                select(Subscription).where(Subscription.organization_id == org.id)
            )
        ).scalar_one_or_none()

        health = await compute_health_score(org.id, db)

        for rule in rules:
            match = False
            conditions = rule.conditions or {}

            if rule.trigger_type.value == "churn_risk":
                threshold = conditions.get("health_below", 40)
                match = health["score"] < threshold

            elif rule.trigger_type.value == "payment_failed":
                match = sub is not None and sub.status == SubscriptionStatus.past_due

            elif rule.trigger_type.value == "low_usage":
                match = health["breakdown"]["production_activity"] <= 5

            elif rule.trigger_type.value == "trial_ending":
                if sub and sub.is_trial and sub.trial_end:
                    now = datetime.now(timezone.utc)
                    trial_end = sub.trial_end
                    if trial_end.tzinfo is None:
                        trial_end = trial_end.replace(tzinfo=timezone.utc)
                    days_left = (trial_end - now).days
                    threshold = conditions.get("days_before", 5)
                    match = 0 < days_left <= threshold

            elif rule.trigger_type.value == "downgrade_request":
                # Manual trigger only — skip in auto-evaluation
                match = False

            if match:
                event = RetentionEvent(
                    organization_id=org.id,
                    rule_id=rule.id,
                    trigger_type=rule.trigger_type,
                    action_taken=rule.action_type.value,
                    result=f"score={health['score']}, risk={health['risk']}",
                )
                db.add(event)
                triggered.append({
                    "organization_id": str(org.id),
                    "organization_name": org.name,
                    "rule": rule.name,
                    "trigger": rule.trigger_type.value,
                    "action": rule.action_type.value,
                    "health_score": health["score"],
                })

    if triggered:
        await db.flush()

    return triggered
