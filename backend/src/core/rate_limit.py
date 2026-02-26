"""Redis-based rate limiting for auth endpoints."""

import logging
import redis.asyncio as aioredis

from src.config import settings

logger = logging.getLogger("egglogu.rate_limit")

_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    global _redis
    if settings.REDIS_URL:
        try:
            _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis.ping()
            logger.info("Redis connected for rate limiting")
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

    SECURITY: Fail-closed — denies requests when Redis is unavailable
    to prevent abuse during outages.
    """
    if not _redis:
        logger.error("Rate limit DENIED — Redis unavailable (key=%s)", key)
        return False  # Fail-closed: deny requests when Redis is unavailable
    try:
        full_key = f"rl:{key}"
        current = await _redis.incr(full_key)
        if current == 1:
            await _redis.expire(full_key, window_seconds)
        return current <= max_requests
    except Exception as e:
        logger.error("Rate limit DENIED — check failed: %s", e)
        return False  # Fail-closed on errors
