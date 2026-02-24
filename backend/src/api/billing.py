import logging
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_org_plan, get_subscription
from src.config import settings
from src.core.exceptions import ForbiddenError, NotFoundError
from src.core.plans import get_allowed_modules, PLAN_LIMITS
from src.core.stripe import (
    DISCOUNT_PHASES,
    apply_phase_coupon,
    compute_phase,
    construct_webhook_event,
    create_checkout_session,
    create_customer_portal,
    get_effective_price,
    get_phase_discount,
)
from src.database import get_db
from src.models.auth import User
from src.models.subscription import PlanTier, Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str = "pro"
    interval: str = "month"  # "month" or "year"
    success_url: str | None = None
    cancel_url: str | None = None


class BillingStatusResponse(BaseModel):
    plan: str
    status: str
    modules: list[str]
    current_period_end: str | None = None
    billing_interval: str = "month"
    is_trial: bool = False
    trial_end: str | None = None
    trial_days_left: int | None = None
    # Soft landing
    discount_phase: int = 0
    months_subscribed: int = 0
    current_price: float = 0.0
    base_price: float = 0.0
    next_price: float | None = None
    discount_pct: int = 0
    discount_label: str = ""

    model_config = {"from_attributes": True}


class PortalResponse(BaseModel):
    url: str


class PricingTier(BaseModel):
    tier: str
    price_monthly: int
    price_annual: int
    price_monthly_q1: float
    price_annual_display: float
    features: list[str]
    limits: dict


@router.get("/pricing")
async def get_pricing():
    """Public endpoint: return all tier pricing with Q1 discount."""
    tiers = []
    for tier_name in ["hobby", "starter", "pro", "enterprise"]:
        limits = PLAN_LIMITS[tier_name]
        q1 = get_effective_price(tier_name, 1, "month")
        tiers.append(
            {
                "tier": tier_name,
                "price_monthly": limits["price_monthly"],
                "price_annual": limits["price_annual"],
                "price_monthly_q1": q1["effective_price"],
                "annual_monthly": round(limits["price_annual"] / 12, 2),
                "limits": {
                    "farms": limits.get("farms"),
                    "flocks": limits.get("flocks"),
                    "users": limits.get("users"),
                },
                "modules": limits.get("modules"),
                "support_sla_hours": limits.get("support_sla_hours"),
            }
        )
    return {"tiers": tiers, "trial_days": 30, "q1_discount_pct": 40}


@router.post("/create-checkout")
async def create_checkout(
    data: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if data.plan not in ("hobby", "starter", "pro", "enterprise"):
        raise ForbiddenError("Invalid plan tier")
    if data.interval not in ("month", "year"):
        raise ForbiddenError("Invalid billing interval")

    sub = await get_subscription(user.organization_id, db)
    customer_id = sub.stripe_customer_id if sub else None

    success = data.success_url or f"{settings.FRONTEND_URL}/?billing=success"
    cancel = data.cancel_url or f"{settings.FRONTEND_URL}/?billing=cancel"

    url = await create_checkout_session(
        org_id=str(user.organization_id),
        plan=data.plan,
        interval=data.interval,
        success_url=success,
        cancel_url=cancel,
        customer_id=customer_id,
    )
    return {"checkout_url": url}


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = construct_webhook_event(payload, sig)
    except ValueError:
        raise ForbiddenError("Invalid webhook payload")
    except Exception as e:
        logger.warning("Webhook signature verification failed: %s", e)
        raise ForbiddenError("Invalid webhook signature")

    event_type = event["type"]
    data_obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        org_id_str = data_obj.get("metadata", {}).get("org_id")
        plan_str = data_obj.get("metadata", {}).get("plan", "pro")
        interval = data_obj.get("metadata", {}).get("interval", "month")
        customer_id = data_obj.get("customer")
        subscription_id = data_obj.get("subscription")
        if org_id_str:
            try:
                org_uuid = _uuid.UUID(org_id_str)
            except ValueError:
                logger.warning("Invalid org_id in checkout metadata: %s", org_id_str)
                return {"status": "ok"}
            result = await db.execute(
                select(Subscription).where(Subscription.organization_id == org_uuid)
            )
            sub = result.scalar_one_or_none()
            if sub:
                sub.stripe_customer_id = customer_id
                sub.stripe_subscription_id = subscription_id
                sub.plan = PlanTier(plan_str)
                sub.is_trial = False
                sub.status = SubscriptionStatus.active
                sub.discount_phase = 1  # Q1: 40% off
                sub.months_subscribed = 0
                sub.billing_interval = interval
                await db.flush()
                logger.info(
                    "Checkout completed: org %s → %s/%s (Q1 40%% off)",
                    org_uuid,
                    plan_str,
                    interval,
                )

    elif event_type == "customer.subscription.created":
        sub = await _find_sub_by_stripe_id(data_obj.get("id"), db)
        if sub:
            _apply_subscription_data(sub, data_obj)
            await db.flush()

    elif event_type == "customer.subscription.updated":
        sub = await _find_sub_by_stripe_id(data_obj.get("id"), db)
        if sub:
            _apply_subscription_data(sub, data_obj)
            await db.flush()

    elif event_type == "customer.subscription.deleted":
        sub = await _find_sub_by_stripe_id(data_obj.get("id"), db)
        if sub:
            sub.status = SubscriptionStatus.suspended
            sub.stripe_subscription_id = None
            sub.current_period_end = None
            await db.flush()

    elif event_type == "invoice.paid":
        stripe_sub_id = data_obj.get("subscription")
        if stripe_sub_id:
            sub = await _find_sub_by_stripe_id(stripe_sub_id, db)
            if (
                sub
                and sub.status == SubscriptionStatus.active
                and sub.billing_interval == "month"
            ):
                # Advance month counter and check if we need to change discount phase
                sub.months_subscribed += 1
                new_phase = compute_phase(sub.months_subscribed)
                if new_phase != sub.discount_phase:
                    sub.discount_phase = new_phase
                    await db.flush()
                    # Apply the new coupon for next billing cycles
                    await apply_phase_coupon(sub.stripe_subscription_id, new_phase)
                    logger.info(
                        "Soft landing: org %s → phase %d (%s) after %d months",
                        sub.organization_id,
                        new_phase,
                        get_phase_discount(new_phase)["label"],
                        sub.months_subscribed,
                    )
                else:
                    await db.flush()

    elif event_type == "invoice.payment_failed":
        stripe_sub_id = data_obj.get("subscription")
        if stripe_sub_id:
            sub = await _find_sub_by_stripe_id(stripe_sub_id, db)
            if sub:
                sub.status = SubscriptionStatus.past_due
                await db.flush()

    return {"status": "ok"}


@router.get("/portal", response_model=PortalResponse)
async def billing_portal(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await get_subscription(user.organization_id, db)
    if not sub or not sub.stripe_customer_id:
        raise NotFoundError("No billing account found. Subscribe to a plan first.")
    url = await create_customer_portal(
        sub.stripe_customer_id,
        return_url=f"{settings.FRONTEND_URL}/?billing=portal",
    )
    return PortalResponse(url=url)


@router.get("/status", response_model=BillingStatusResponse)
async def billing_status(
    plan: str = Depends(get_org_plan),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = await get_subscription(user.organization_id, db)
    period_end = None
    sub_status = "active"
    is_trial = False
    trial_end = None
    trial_days_left = None
    discount_phase = 0
    months_subscribed = 0
    current_price = 0.0
    base_price = 0.0
    next_price = None
    discount_pct = 0
    discount_label = ""
    billing_interval = "month"

    if sub:
        period_end = (
            sub.current_period_end.isoformat() if sub.current_period_end else None
        )
        sub_status = sub.status.value
        is_trial = sub.is_trial
        discount_phase = sub.discount_phase
        months_subscribed = sub.months_subscribed
        billing_interval = sub.billing_interval or "month"

        if sub.is_trial and sub.trial_end:
            trial_end = sub.trial_end.isoformat()
            delta = sub.trial_end.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)
            trial_days_left = max(0, delta.days)

        # Effective price calculation
        price_info = get_effective_price(plan, discount_phase, billing_interval)
        current_price = price_info["effective_price"]
        base_price = price_info["base_price"]
        discount_pct = price_info["discount_pct"]
        discount_label = price_info["label"]

        # Next phase price (for display)
        if discount_phase < len(DISCOUNT_PHASES) - 1:
            next_info = get_effective_price(plan, discount_phase + 1, billing_interval)
            if next_info["effective_price"] != current_price:
                next_price = next_info["effective_price"]

    return BillingStatusResponse(
        plan=plan,
        status=sub_status,
        modules=get_allowed_modules(plan),
        current_period_end=period_end,
        billing_interval=billing_interval,
        is_trial=is_trial,
        trial_end=trial_end,
        trial_days_left=trial_days_left,
        discount_phase=discount_phase,
        months_subscribed=months_subscribed,
        current_price=current_price,
        base_price=base_price,
        next_price=next_price,
        discount_pct=discount_pct,
        discount_label=discount_label,
    )


# ── Helpers ──


async def _find_sub_by_stripe_id(
    stripe_sub_id: str, db: AsyncSession
) -> Subscription | None:
    if not stripe_sub_id:
        return None
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    return result.scalar_one_or_none()


def _apply_subscription_data(sub: Subscription, data_obj: dict) -> None:
    sub.is_trial = False

    stripe_status = data_obj.get("status", "active")
    if stripe_status == "active":
        sub.status = SubscriptionStatus.active
    elif stripe_status == "past_due":
        sub.status = SubscriptionStatus.past_due
    elif stripe_status in ("canceled", "unpaid"):
        sub.status = SubscriptionStatus.suspended

    period_end = data_obj.get("current_period_end")
    if period_end:
        sub.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)
