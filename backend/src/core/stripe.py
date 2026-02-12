import stripe

from src.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


async def create_checkout_session(
    org_id: str,
    plan: str,
    success_url: str,
    cancel_url: str,
    customer_id: str | None = None,
) -> str:
    price_map = {
        "pro": settings.STRIPE_PRICE_PRO,
        "business": settings.STRIPE_PRICE_BUSINESS,
    }
    price_id = price_map.get(plan)
    if not price_id:
        raise ValueError(f"No Stripe price configured for plan: {plan}")

    params: dict = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": 1}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {"org_id": org_id},
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
