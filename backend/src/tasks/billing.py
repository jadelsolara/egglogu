"""Billing and Stripe webhook processing tasks."""

import logging

from src.worker import app

logger = logging.getLogger("egglogu.tasks.billing")


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_stripe_webhook(self, event_type: str, event_data: dict):
    """Process Stripe webhook events asynchronously."""
    logger.info("Processing Stripe webhook: %s", event_type)
    try:
        import asyncio
        from src.database import async_session

        async def _process():
            async with async_session() as db:
                if event_type == "checkout.session.completed":
                    await _handle_checkout_completed(db, event_data)
                elif event_type == "invoice.paid":
                    await _handle_invoice_paid(db, event_data)
                elif event_type == "customer.subscription.deleted":
                    await _handle_subscription_cancelled(db, event_data)
                elif event_type == "invoice.payment_failed":
                    await _handle_payment_failed(db, event_data)
                await db.commit()

        asyncio.run(_process())
        logger.info("Stripe webhook %s processed successfully", event_type)
    except Exception as exc:
        logger.error("Stripe webhook %s failed: %s", event_type, exc)
        raise self.retry(exc=exc)


async def _handle_checkout_completed(db, event_data: dict):
    """Handle successful checkout — activate subscription."""
    from sqlalchemy import select
    from src.models.subscription import Subscription, SubscriptionStatus
    from src.api.deps import invalidate_subscription_cache

    customer_id = event_data.get("customer")
    if not customer_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == customer_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = SubscriptionStatus.active
        sub.is_trial = False
        sub.stripe_subscription_id = event_data.get("subscription")
        await db.flush()
        await invalidate_subscription_cache(sub.organization_id)
        logger.info("Subscription activated for customer %s", customer_id)


async def _handle_invoice_paid(db, event_data: dict):
    """Handle paid invoice — extend subscription period."""
    logger.info("Invoice paid: %s", event_data.get("id"))


async def _handle_subscription_cancelled(db, event_data: dict):
    """Handle subscription cancellation."""
    from sqlalchemy import select
    from src.models.subscription import Subscription, SubscriptionStatus
    from src.api.deps import invalidate_subscription_cache

    sub_id = event_data.get("id")
    if not sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = SubscriptionStatus.suspended
        await db.flush()
        await invalidate_subscription_cache(sub.organization_id)
        logger.info("Subscription cancelled: %s", sub_id)


async def _handle_payment_failed(db, event_data: dict):
    """Handle failed payment — send notification."""
    logger.warning("Payment failed for invoice: %s", event_data.get("id"))
