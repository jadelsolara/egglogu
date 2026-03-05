"""Redis-based rate limiting for auth endpoints.

Supports both direct Redis connection and Redis Sentinel for HA failover.
"""

import logging
import redis.asyncio as aioredis
from redis.asyncio.sentinel import Sentinel

from src.config import settings

logger = logging.getLogger("egglogu.rate_limit")

_redis: aioredis.Redis | None = None


def _parse_sentinel_hosts(hosts_str: str) -> list[tuple[str, int]]:
    """Parse 'host1:port1,host2:port2' into list of (host, port) tuples."""
    result = []
    for entry in hosts_str.split(","):
        entry = entry.strip()
        if ":" in entry:
            host, port = entry.rsplit(":", 1)
            result.append((host, int(port)))
    return result


async def init_redis() -> None:
    global _redis
    try:
        if settings.REDIS_SENTINEL_HOSTS:
            # Sentinel mode — automatic failover
            sentinels = _parse_sentinel_hosts(settings.REDIS_SENTINEL_HOSTS)
            sentinel = Sentinel(sentinels, socket_timeout=3)
            _redis = sentinel.master_for(
                settings.REDIS_SENTINEL_MASTER,
                redis_class=aioredis.Redis,
                decode_responses=True,
            )
            await _redis.ping()
            logger.info(
                "Redis connected via Sentinel (master=%s)",
                settings.REDIS_SENTINEL_MASTER,
            )
        elif settings.REDIS_URL:
            # Direct connection mode
            _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis.ping()
            logger.info("Redis connected (direct) for rate limiting")
        else:
            logger.warning("No Redis URL or Sentinel configured")
    except Exception as e:
        logger.warning("Redis unavailable for rate limiting: %s", e)
        _redis = None


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """Return True if request is allowed, False if rate limited.

    Fail-open when Redis is unavailable: allows requests through but logs warnings.
    Rate limiting is enforced normally when Redis is up.
    """
    if not _redis:
        logger.warning("Rate limit BYPASSED — Redis unavailable (key=%s)", key)
        return True  # Fail-open: allow requests when Redis is unavailable
    try:
        full_key = f"rl:{key}"
        current = await _redis.incr(full_key)
        if current == 1:
            await _redis.expire(full_key, window_seconds)
        return current <= max_requests
    except Exception as e:
        logger.warning("Rate limit BYPASSED — check failed: %s", e)
        return True  # Fail-open on errors to avoid blocking all traffic


# ─── Plan-based API key rate limits ──────────────────────────────────

# Requests per hour by plan
PLAN_RATE_LIMITS = {
    "hobby": 100,
    "starter": 1_000,
    "pro": 10_000,
    "enterprise": 1_000_000,  # Effectively unlimited
}


async def check_api_key_rate_limit(key_hash: str, plan: str) -> bool:
    """Check rate limit for an API key based on the org's plan.

    Returns True if allowed, False if rate limited.
    """
    max_requests = PLAN_RATE_LIMITS.get(plan, 100)
    return await check_rate_limit(f"apikey:{key_hash[:16]}", max_requests, 3600)
