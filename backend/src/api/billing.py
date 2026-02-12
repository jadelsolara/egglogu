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
from src.core.plans import get_allowed_modules
from src.core.stripe import construct_webhook_event, create_checkout_session, create_customer_portal
from src.database import get_db
from src.models.auth import User
from src.models.subscription import PlanTier, Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan: str
    success_url: str | None = None
    cancel_url: str | None = None


class BillingStatusResponse(BaseModel):
    plan: str
    status: str
    modules: list[str]
    current_period_end: str | None = None

    model_config = {"from_attributes": True}


class PortalResponse(BaseModel):
    url: str


@router.post("/create-checkout")
async def create_checkout(
    data: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if data.plan not in ("pro", "business"):
        raise ForbiddenError("Invalid plan. Choose 'pro' or 'business'.")

    sub = await get_subscription(user.organization_id, db)
    customer_id = sub.stripe_customer_id if sub else None

    success = data.success_url or f"{settings.FRONTEND_URL}/?billing=success"
    cancel = data.cancel_url or f"{settings.FRONTEND_URL}/?billing=cancel"

    url = await create_checkout_session(
        org_id=str(user.organization_id),
        plan=data.plan,
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
    except Exception:
        raise ForbiddenError("Invalid webhook signature")

    event_type = event["type"]
    data_obj = event["data"]["object"]

    if event_type == "checkout.session.completed":
        org_id_str = data_obj.get("metadata", {}).get("org_id")
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
                await db.flush()

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
            sub.plan = PlanTier.free
            sub.status = SubscriptionStatus.cancelled
            sub.stripe_subscription_id = None
            sub.current_period_end = None
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
    if sub:
        period_end = sub.current_period_end.isoformat() if sub.current_period_end else None
        sub_status = sub.status.value

    return BillingStatusResponse(
        plan=plan,
        status=sub_status,
        modules=get_allowed_modules(plan),
        current_period_end=period_end,
    )


# ── Helpers ──

async def _find_sub_by_stripe_id(stripe_sub_id: str, db: AsyncSession) -> Subscription | None:
    if not stripe_sub_id:
        return None
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    return result.scalar_one_or_none()


def _apply_subscription_data(sub: Subscription, data_obj: dict) -> None:
    price_id = None
    items = data_obj.get("items", {}).get("data", [])
    if items:
        price_id = items[0].get("price", {}).get("id")

    if price_id == settings.STRIPE_PRICE_PRO:
        sub.plan = PlanTier.pro
    elif price_id == settings.STRIPE_PRICE_BUSINESS:
        sub.plan = PlanTier.business
    else:
        logger.warning("Unknown Stripe price_id: %s — keeping current plan", price_id)
        return

    stripe_status = data_obj.get("status", "active")
    if stripe_status == "active":
        sub.status = SubscriptionStatus.active
    elif stripe_status == "past_due":
        sub.status = SubscriptionStatus.past_due
    elif stripe_status in ("canceled", "unpaid"):
        sub.status = SubscriptionStatus.cancelled

    period_end = data_obj.get("current_period_end")
    if period_end:
        sub.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)
