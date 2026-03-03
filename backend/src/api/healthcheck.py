"""
System health check endpoints — 3-tier health checks for enterprise monitoring.

Endpoints:
  /health/live     — K8s liveness: app process alive (no dependency checks)
  /health/ready    — K8s readiness: DB + Redis + disk space
  /health/detailed — Admin-only: full metrics (pool, cache, queue depth)
  /health          — Legacy: backward-compatible comprehensive check
  /ping            — Lightweight pong

NOT to be confused with src/api/health.py which handles animal health records.
"""

import os
import shutil
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.config import settings
from src.core.rate_limit import _redis
from src.database import async_session, engine

router = APIRouter(tags=["system"])

_start_time = time.monotonic()
_boot_utc = datetime.now(timezone.utc).isoformat()

APP_VERSION = "3.0.0"


def _format_uptime(seconds: float) -> str:
    """Convert seconds to human-readable uptime string."""
    days, remainder = divmod(int(seconds), 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, secs = divmod(remainder, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


async def _check_database() -> dict:
    """Probe PostgreSQL with a lightweight query and measure latency."""
    try:
        t0 = time.monotonic()
        async with async_session() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar()
        latency = round((time.monotonic() - t0) * 1000, 2)
        return {"status": "ok", "latency_ms": latency}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


async def _check_redis() -> dict:
    """Probe Redis with PING and measure latency."""
    if _redis is None:
        return {"status": "not_configured"}
    try:
        t0 = time.monotonic()
        pong = await _redis.ping()
        latency = round((time.monotonic() - t0) * 1000, 2)
        if pong:
            return {"status": "ok", "latency_ms": latency}
        return {"status": "error", "detail": "PING returned False"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


def _check_disk() -> dict:
    """Check disk space on the data volume."""
    try:
        usage = shutil.disk_usage("/")
        total_gb = round(usage.total / (1024**3), 2)
        used_gb = round(usage.used / (1024**3), 2)
        free_gb = round(usage.free / (1024**3), 2)
        pct_used = round((usage.used / usage.total) * 100, 1)
        status = "ok" if pct_used < 90 else ("warning" if pct_used < 95 else "critical")
        return {
            "status": status,
            "total_gb": total_gb,
            "used_gb": used_gb,
            "free_gb": free_gb,
            "percent_used": pct_used,
        }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


def _check_memory() -> dict:
    """Check process memory usage."""
    try:
        import resource
        rusage = resource.getrusage(resource.RUSAGE_SELF)
        rss_mb = round(rusage.ru_maxrss / 1024, 2)  # Linux: KB → MB
        return {"status": "ok", "rss_mb": rss_mb}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


async def _check_db_pool() -> dict:
    """Get SQLAlchemy connection pool statistics."""
    try:
        pool = engine.pool
        return {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
            "invalid": pool.status(),
        }
    except Exception:
        return {"status": "unavailable"}


async def _check_celery_queue() -> dict:
    """Check Celery queue depths via Redis."""
    if _redis is None:
        return {"status": "not_configured"}
    try:
        queues = ["celery", "email", "reports", "webhooks"]
        depths = {}
        for q in queues:
            length = await _redis.llen(q)
            depths[q] = length
        total = sum(depths.values())
        return {"status": "ok", "queues": depths, "total_pending": total}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


async def _check_redis_info() -> dict:
    """Get Redis memory and hit rate stats."""
    if _redis is None:
        return {"status": "not_configured"}
    try:
        info = await _redis.info(section="memory")
        stats = await _redis.info(section="stats")
        hits = stats.get("keyspace_hits", 0)
        misses = stats.get("keyspace_misses", 0)
        hit_rate = round(hits / (hits + misses) * 100, 1) if (hits + misses) > 0 else 0
        return {
            "status": "ok",
            "used_memory_human": info.get("used_memory_human", "N/A"),
            "used_memory_peak_human": info.get("used_memory_peak_human", "N/A"),
            "connected_clients": stats.get("connected_clients", "N/A"),
            "cache_hit_rate_pct": hit_rate,
            "total_keys_hits": hits,
            "total_keys_misses": misses,
        }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


# ─── Tier 1: Liveness ───────────────────────────────────────────────

@router.get("/health/live")
async def health_live():
    """K8s liveness probe — app process is alive, no dependency checks."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ─── Tier 2: Readiness ──────────────────────────────────────────────

@router.get("/health/ready")
async def health_ready():
    """K8s readiness probe — DB + Redis + disk must be healthy."""
    db = await _check_database()
    redis = await _check_redis()
    disk = _check_disk()

    db_ok = db["status"] == "ok"
    redis_ok = redis["status"] in ("ok", "not_configured")
    disk_ok = disk["status"] in ("ok", "warning")

    all_ready = db_ok and redis_ok and disk_ok

    payload = {
        "status": "ready" if all_ready else "not_ready",
        "database": db,
        "redis": redis,
        "disk": disk,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(content=payload, status_code=200 if all_ready else 503)


# ─── Tier 3: Detailed (admin only) ──────────────────────────────────

@router.get("/health/detailed")
async def health_detailed():
    """
    Full system diagnostics — admin only in production.

    Includes: DB pool stats, Redis memory/hit-rate, Celery queue depths,
    process memory, disk space, uptime.
    """
    db = await _check_database()
    redis = await _check_redis()
    disk = _check_disk()
    memory = _check_memory()
    pool = await _check_db_pool()
    celery = await _check_celery_queue()
    redis_info = await _check_redis_info()

    uptime_secs = time.monotonic() - _start_time

    db_ok = db["status"] == "ok"
    redis_ok = redis["status"] in ("ok", "not_configured")
    disk_ok = disk["status"] in ("ok", "warning")

    all_ok = db_ok and redis_ok and disk_ok

    payload = {
        "status": "ok" if all_ok else "degraded",
        "version": APP_VERSION,
        "environment": "production"
        if settings.FRONTEND_URL == "https://egglogu.com"
        else "development",
        "database": {**db, "pool": pool},
        "redis": {**redis, "info": redis_info},
        "celery": celery,
        "disk": disk,
        "memory": memory,
        "uptime": _format_uptime(uptime_secs),
        "uptime_seconds": round(uptime_secs, 2),
        "boot_time": _boot_utc,
        "pid": os.getpid(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(content=payload, status_code=200 if all_ok else 503)


# ─── Legacy (backward-compatible) ───────────────────────────────────

@router.get("/health")
async def system_health():
    """
    Backward-compatible comprehensive health check.

    Returns:
        - status: "ok" if all services are reachable, "degraded" if any fail
        - version, database, redis, timestamp, uptime, boot_time
    """
    db_status = await _check_database()
    redis_status = await _check_redis()

    all_ok = db_status["status"] == "ok" and redis_status["status"] in (
        "ok",
        "not_configured",
    )

    uptime_secs = time.monotonic() - _start_time

    status = "ok" if all_ok else "degraded"
    payload = {
        "status": status,
        "version": APP_VERSION,
        "environment": "production"
        if settings.FRONTEND_URL == "https://egglogu.com"
        else "development",
        "database": db_status,
        "redis": redis_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime": _format_uptime(uptime_secs),
        "uptime_seconds": round(uptime_secs, 2),
        "boot_time": _boot_utc,
    }

    return JSONResponse(
        content=payload,
        status_code=200 if all_ok else 503,
    )


@router.get("/ping")
async def ping():
    """Lightweight liveness probe — no dependency checks."""
    return {"ping": "pong"}
