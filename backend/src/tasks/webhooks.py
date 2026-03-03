"""Webhook delivery background tasks with HMAC signing and retry."""

import hashlib
import hmac
import json
import logging
import time

import requests

from src.worker import app

logger = logging.getLogger("egglogu.tasks.webhooks")


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def deliver_webhook(self, webhook_id: str, event_type: str, payload: dict):
    """Deliver a webhook event to the registered URL with HMAC-SHA256 signature."""
    logger.info("Delivering webhook=%s event=%s attempt=%d", webhook_id, event_type, self.request.retries + 1)

    try:
        import asyncio
        from src.database import async_session
        from sqlalchemy import select
        from src.models.webhook import Webhook, WebhookDelivery
        from datetime import datetime, timezone
        import uuid

        async def _deliver():
            async with async_session() as db:
                result = await db.execute(
                    select(Webhook).where(Webhook.id == webhook_id, Webhook.is_active == True)
                )
                webhook = result.scalar_one_or_none()
                if not webhook:
                    logger.warning("Webhook %s not found or inactive — skipping", webhook_id)
                    return

                # Sign payload with HMAC-SHA256
                body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
                signature = hmac.new(
                    webhook.secret.encode(), body.encode(), hashlib.sha256
                ).hexdigest()

                headers = {
                    "Content-Type": "application/json",
                    "X-EGGlogU-Signature": f"sha256={signature}",
                    "X-EGGlogU-Event": event_type,
                    "X-EGGlogU-Delivery": str(uuid.uuid4()),
                    "User-Agent": "EGGlogU-Webhook/3.0",
                }

                # Deliver
                delivery = WebhookDelivery(
                    webhook_id=webhook.id,
                    event_type=event_type,
                    payload=payload,
                    attempt=self.request.retries + 1,
                )

                t0 = time.monotonic()
                try:
                    resp = requests.post(
                        webhook.url,
                        data=body,
                        headers=headers,
                        timeout=10,
                    )
                    latency = int((time.monotonic() - t0) * 1000)

                    delivery.response_status = resp.status_code
                    delivery.response_body = resp.text[:1000]
                    delivery.latency_ms = latency
                    delivery.success = 200 <= resp.status_code < 300

                    webhook.total_deliveries += 1
                    webhook.last_delivery_at = datetime.now(timezone.utc)

                    if not delivery.success:
                        webhook.total_failures += 1
                        webhook.last_failure_at = datetime.now(timezone.utc)
                        logger.warning(
                            "Webhook %s returned %d for %s",
                            webhook_id, resp.status_code, event_type,
                        )

                except requests.RequestException as e:
                    latency = int((time.monotonic() - t0) * 1000)
                    delivery.latency_ms = latency
                    delivery.success = False
                    delivery.error = str(e)[:500]
                    webhook.total_failures += 1
                    webhook.last_failure_at = datetime.now(timezone.utc)
                    logger.error("Webhook %s delivery failed: %s", webhook_id, e)

                db.add(delivery)
                await db.commit()

                if not delivery.success:
                    raise Exception(f"Delivery failed: status={delivery.response_status}")

        asyncio.run(_deliver())
        logger.info("Webhook %s delivered for %s", webhook_id, event_type)

    except Exception as exc:
        logger.error("Webhook task failed: %s", exc)
        # Exponential backoff: 30s, 60s, 120s
        raise self.retry(exc=exc, countdown=30 * (2 ** self.request.retries))


def dispatch_webhooks(org_id: str, event_type: str, data: dict):
    """Queue webhook deliveries for all active webhooks matching the event type.

    Call this from API routes after domain events occur.
    """
    import asyncio
    from src.database import async_session
    from sqlalchemy import select
    from src.models.webhook import Webhook

    async def _dispatch():
        async with async_session() as db:
            result = await db.execute(
                select(Webhook).where(
                    Webhook.organization_id == org_id,
                    Webhook.is_active == True,
                )
            )
            webhooks = result.scalars().all()

            for wh in webhooks:
                if event_type in wh.events or "*" in wh.events:
                    deliver_webhook.delay(str(wh.id), event_type, data)
                    logger.debug("Queued webhook %s for %s", wh.id, event_type)

    try:
        asyncio.run(_dispatch())
    except RuntimeError:
        # Already in async context — use create_task instead
        loop = asyncio.get_event_loop()
        loop.create_task(_dispatch())
