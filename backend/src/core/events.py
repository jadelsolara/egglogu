"""Redis Pub/Sub event system for real-time notifications.

Publishes domain events (production, health, alerts, IoT) to Redis channels.
WebSocket manager subscribes and pushes to connected clients.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from src.core.rate_limit import _redis

logger = logging.getLogger("egglogu.events")


# ─── Event Types ─────────────────────────────────────────────────────

class EventType:
    PRODUCTION_NEW = "production.new"
    PRODUCTION_UPDATE = "production.update"
    HEALTH_ALERT = "health.alert"
    HEALTH_VACCINE = "health.vaccine"
    ENVIRONMENT_READING = "environment.reading"
    IOT_READING = "iot.reading"
    FEED_PURCHASE = "feed.purchase"
    BIOSECURITY_ALERT = "biosecurity.alert"
    FLOCK_UPDATE = "flock.update"
    FINANCE_INCOME = "finance.income"
    FINANCE_EXPENSE = "finance.expense"
    SYSTEM_ALERT = "system.alert"


def _channel_for_farm(farm_id: str) -> str:
    """Redis channel name for a farm's events."""
    return f"events:farm:{farm_id}"


def _channel_for_org(org_id: str) -> str:
    """Redis channel name for org-wide events."""
    return f"events:org:{org_id}"


async def publish_event(
    event_type: str,
    farm_id: str | None = None,
    org_id: str | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """Publish a domain event to Redis Pub/Sub.

    Events are published to both farm-specific and org-wide channels
    so WebSocket clients can subscribe at either granularity.
    """
    if _redis is None:
        logger.debug("Event not published (Redis unavailable): %s", event_type)
        return

    payload = json.dumps({
        "type": event_type,
        "farm_id": farm_id,
        "org_id": org_id,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    try:
        published = 0
        if farm_id:
            published += await _redis.publish(_channel_for_farm(farm_id), payload)
        if org_id:
            published += await _redis.publish(_channel_for_org(org_id), payload)
        logger.debug("Event %s published to %d subscribers", event_type, published)
    except Exception as e:
        logger.warning("Failed to publish event %s: %s", event_type, e)


async def subscribe_farm(farm_id: str):
    """Return a Redis Pub/Sub subscription for a farm's event channel."""
    if _redis is None:
        return None
    pubsub = _redis.pubsub()
    await pubsub.subscribe(_channel_for_farm(farm_id))
    return pubsub


async def subscribe_org(org_id: str):
    """Return a Redis Pub/Sub subscription for an org's event channel."""
    if _redis is None:
        return None
    pubsub = _redis.pubsub()
    await pubsub.subscribe(_channel_for_org(org_id))
    return pubsub
