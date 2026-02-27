"""Redis caching helpers for expensive queries (analytics, reports)."""

import json
import logging

logger = logging.getLogger("egglogu.cache")


def _redis():
    """Access the shared Redis instance from rate_limit module."""
    from src.core.rate_limit import _redis as r

    return r


async def get_cached(key: str):
    """Get a cached value by key. Returns None on miss or Redis unavailable."""
    r = _redis()
    if not r:
        return None
    try:
        val = await r.get(f"cache:{key}")
        return json.loads(val) if val else None
    except Exception as e:
        logger.warning("Cache GET failed (key=%s): %s", key, e)
        return None


async def set_cached(key: str, data, ttl: int = 300):
    """Cache a value with TTL (default 5 min). Silently fails if Redis unavailable."""
    r = _redis()
    if not r:
        return
    try:
        await r.set(f"cache:{key}", json.dumps(data, default=str), ex=ttl)
    except Exception as e:
        logger.warning("Cache SET failed (key=%s): %s", key, e)


async def invalidate_prefix(prefix: str):
    """Delete all cache keys matching prefix. Use after writes to cached entities."""
    r = _redis()
    if not r:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor, match=f"cache:{prefix}:*", count=100)
            if keys:
                await r.delete(*keys)
            if cursor == 0:
                break
    except Exception as e:
        logger.warning("Cache INVALIDATE failed (prefix=%s): %s", prefix, e)
