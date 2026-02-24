"""Redis-based rate limiting for auth endpoints."""

import redis.asyncio as aioredis

from src.config import settings

_redis: aioredis.Redis | None = None


async def init_redis() -> None:
    global _redis
    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> bool:
    """Return True if request is allowed, False if rate limited."""
    if not _redis:
        return False  # Fail-closed: block requests when Redis is unavailable
    full_key = f"rl:{key}"
    current = await _redis.incr(full_key)
    if current == 1:
        await _redis.expire(full_key, window_seconds)
    return current <= max_requests
