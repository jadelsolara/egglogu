import stripe

from src.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY

# ── Quarterly soft landing discount phases ──
# Year 1: Trial → Q1(40%off) → Q2(25%off) → Q3(15%off) → Q4(full)
# Year 2+: Full price for new customers, same structure
DISCOUNT_PHASES = [
    (0, "Trial — 30 days free"),  # phase 0: trial
    (40, "Welcome — 40% off"),  # phase 1: Q1 (months 1-3)
    (25, "Growing — 25% off"),  # phase 2: Q2 (months 4-6)
    (15, "Loyalty — 15% off"),  # phase 3: Q3 (months 7-9)
    (0, "Full access"),  # phase 4: full price (months 10+)
]

# Price IDs per tier (monthly + annual)
TIER_PRICE_MAP = {
    "hobby": {
        "month": settings.STRIPE_PRICE_HOBBY,
        "year": settings.STRIPE_PRICE_HOBBY_ANNUAL,
    },
    "starter": {
        "month": settings.STRIPE_PRICE_STARTER,
        "year": settings.STRIPE_PRICE_STARTER_ANNUAL,
    },
    "pro": {
        "month": settings.STRIPE_PRICE_PRO,
        "year": settings.STRIPE_PRICE_PRO_ANNUAL,
    },
    "enterprise": {
        "month": settings.STRIPE_PRICE_ENTERPRISE,
        "year": settings.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    },
}

# Base prices for display calculations
TIER_BASE_PRICES = {
    "hobby": {"month": 9, "year": 90},
    "starter": {"month": 19, "year": 190},
    "pro": {"month": 49, "year": 490},
    "enterprise": {"month": 99, "year": 990},
}


def get_phase_discount(phase: int) -> dict:
    """Get discount info for a given phase."""
    if phase >= len(DISCOUNT_PHASES):
        return {"phase": phase, "percent_off": 0, "label": "Full access"}
    pct, label = DISCOUNT_PHASES[phase]
    return {"phase": phase, "percent_off": pct, "label": label}


def get_effective_price(tier: str, phase: int, interval: str = "month") -> dict:
    """Calculate effective price for a tier at a given discount phase."""
    base = TIER_BASE_PRICES.get(tier, TIER_BASE_PRICES["hobby"])
    base_price = base[interval]
    disc = get_phase_discount(phase)
    pct = disc["percent_off"]
    effective = round(base_price * (100 - pct) / 100, 2)
    return {
        "tier": tier,
        "interval": interval,
        "phase": phase,
        "base_price": base_price,
        "discount_pct": pct,
        "effective_price": effective,
        "label": disc["label"],
    }


def compute_phase(months_subscribed: int) -> int:
    """Compute discount phase from months subscribed (quarterly)."""
    if months_subscribed < 3:
        return 1  # Q1: 40% off
    elif months_subscribed < 6:
        return 2  # Q2: 25% off
    elif months_subscribed < 9:
        return 3  # Q3: 15% off
    else:
        return 4  # Full price


async def get_or_create_coupon(phase: int) -> str | None:
    """Get or create a Stripe coupon for the given discount phase."""
    disc = get_phase_discount(phase)
    if disc["percent_off"] == 0:
        return None
    coupon_id = f"egglogu_q{phase}"
    try:
        stripe.Coupon.retrieve(coupon_id)
    except stripe.error.InvalidRequestError:
        stripe.Coupon.create(
            id=coupon_id,
            percent_off=disc["percent_off"],
            duration="repeating",
            duration_in_months=3,
            name=disc["label"],
        )
    return coupon_id


async def apply_phase_coupon(stripe_sub_id: str, phase: int) -> None:
    """Apply the coupon for the current discount phase."""
    coupon_id = await get_or_create_coupon(phase)
    if coupon_id:
        stripe.Subscription.modify(stripe_sub_id, coupon=coupon_id)
    else:
        # Remove any existing discount (full price)
        stripe.Subscription.modify(stripe_sub_id, coupon="")


async def create_checkout_session(
    org_id: str,
    plan: str,
    interval: str,
    success_url: str,
    cancel_url: str,
    customer_id: str | None = None,
) -> str:
    """Create a Stripe Checkout session for the given plan and interval."""
    tier_prices = TIER_PRICE_MAP.get(plan)
    if not tier_prices:
        raise ValueError(f"Unknown plan: {plan}")
    price_id = tier_prices.get(interval)
    if not price_id:
        raise ValueError(f"No Stripe price configured for {plan}/{interval}")

    # First payment: Q1 coupon (40% off for 3 months)
    coupon_id = await get_or_create_coupon(1)

    params: dict = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"org_id": org_id, "plan": plan, "interval": interval},
        "payment_method_types": ["card"],
        "allow_promotion_codes": True,
    }
    if coupon_id and interval == "month":
        # Only apply quarterly coupon to monthly — annual already has built-in discount
        params["discounts"] = [{"coupon": coupon_id}]
    if customer_id:
        params["customer"] = customer_id
    else:
        params["customer_creation"] = "always"

    session = stripe.checkout.Session.create(**params)
    return session.url


async def create_launch_checkout_session(
    org_id: str,
    success_url: str,
    cancel_url: str,
    customer_id: str | None = None,
) -> str:
    """Create a one-time $75 Stripe Checkout for the 3-month Enterprise launch promo."""
    price_id = settings.STRIPE_PRICE_LAUNCH75
    if not price_id:
        raise ValueError("STRIPE_PRICE_LAUNCH75 not configured")

    params: dict = {
        "mode": "payment",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"org_id": org_id, "plan": "launch75"},
        "payment_method_types": ["card"],
    }
    if customer_id:
        params["customer"] = customer_id
    else:
        params["customer_creation"] = "always"

    session = stripe.checkout.Session.create(**params)
    return session.url


async def create_customer_portal(customer_id: str, return_url: str) -> str:
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url


def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event:
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )


# ── CRM / Billing Management ──────────────────────────────────────


async def list_invoices(customer_id: str, limit: int = 20) -> list[dict]:
    """List invoices for a Stripe customer."""
    invoices = stripe.Invoice.list(customer=customer_id, limit=limit)
    return [
        {
            "id": inv.id,
            "number": inv.number,
            "status": inv.status,
            "amount_due": inv.amount_due,
            "amount_paid": inv.amount_paid,
            "currency": inv.currency,
            "created": inv.created,
            "due_date": inv.due_date,
            "hosted_invoice_url": inv.hosted_invoice_url,
            "pdf": inv.invoice_pdf,
        }
        for inv in invoices.auto_paging_iter()
    ][:limit]


async def create_refund(
    payment_intent_id: str, amount_cents: int | None = None, reason: str = "requested_by_customer"
) -> dict:
    """Create a refund for a payment intent (full or partial)."""
    params: dict = {
        "payment_intent": payment_intent_id,
        "reason": reason,
    }
    if amount_cents:
        params["amount"] = amount_cents

    refund = stripe.Refund.create(**params)
    return {
        "id": refund.id,
        "amount": refund.amount,
        "currency": refund.currency,
        "status": refund.status,
        "reason": refund.reason,
    }


async def list_payment_methods(customer_id: str) -> list[dict]:
    """List payment methods for a Stripe customer."""
    methods = stripe.PaymentMethod.list(customer=customer_id, type="card")
    return [
        {
            "id": pm.id,
            "brand": pm.card.brand if pm.card else None,
            "last4": pm.card.last4 if pm.card else None,
            "exp_month": pm.card.exp_month if pm.card else None,
            "exp_year": pm.card.exp_year if pm.card else None,
            "is_default": False,  # Updated by caller from customer.default_payment_method
        }
        for pm in methods.auto_paging_iter()
    ]


async def create_manual_coupon(
    percent_off: int, duration_months: int, name: str
) -> str:
    """Create a one-off coupon for manual discounts."""
    coupon = stripe.Coupon.create(
        percent_off=percent_off,
        duration="repeating",
        duration_in_months=duration_months,
        name=name,
    )
    return coupon.id


async def change_subscription_plan(
    stripe_sub_id: str, new_plan: str, interval: str = "month"
) -> dict:
    """Change a subscription to a different plan (prorate)."""
    tier_prices = TIER_PRICE_MAP.get(new_plan)
    if not tier_prices:
        raise ValueError(f"Unknown plan: {new_plan}")
    price_id = tier_prices.get(interval)
    if not price_id:
        raise ValueError(f"No price for {new_plan}/{interval}")

    sub = stripe.Subscription.retrieve(stripe_sub_id)
    updated = stripe.Subscription.modify(
        stripe_sub_id,
        items=[{"id": sub["items"]["data"][0].id, "price": price_id}],
        proration_behavior="create_prorations",
    )
    return {
        "id": updated.id,
        "status": updated.status,
        "plan": new_plan,
        "interval": interval,
    }


async def create_stripe_credit_note(
    invoice_id: str, amount_cents: int, reason: str = "order_change"
) -> dict:
    """Create a credit note on a Stripe invoice."""
    cn = stripe.CreditNote.create(
        invoice=invoice_id,
        lines=[
            {
                "type": "custom_line_item",
                "unit_amount": amount_cents,
                "quantity": 1,
                "description": reason,
            }
        ],
    )
    return {
        "id": cn.id,
        "number": cn.number,
        "amount": cn.amount,
        "status": cn.status,
    }
