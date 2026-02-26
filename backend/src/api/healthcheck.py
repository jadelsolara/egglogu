"""
System health check endpoint — /api/health

Returns service status for monitoring, load balancers, and uptime checks.
NOT to be confused with src/api/health.py which handles animal health records.
"""

import time
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from src.config import settings
from src.core.rate_limit import _redis
from src.database import async_session

router = APIRouter(tags=["system"])

# Captured at module load = process start time
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
    """Probe PostgreSQL with a lightweight query."""
    try:
        async with async_session() as session:
            result = await session.execute(text("SELECT 1"))
            result.scalar()
        return {"status": "ok", "latency_ms": None}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


async def _check_redis() -> dict:
    """Probe Redis with PING."""
    if _redis is None:
        return {"status": "not_configured"}
    try:
        pong = await _redis.ping()
        if pong:
            return {"status": "ok"}
        return {"status": "error", "detail": "PING returned False"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)[:200]}


@router.get("/health")
async def system_health():
    """
    Comprehensive health check for monitoring and load balancers.

    Returns:
        - status: "ok" if all services are reachable, "degraded" if any fail
        - version: application version
        - database: PostgreSQL connection status
        - redis: Redis connection status
        - timestamp: current UTC ISO timestamp
        - uptime: human-readable uptime since process start
        - uptime_seconds: raw uptime in seconds
        - boot_time: UTC ISO timestamp when the process started
    """
    db_status = await _check_database()
    redis_status = await _check_redis()

    # Overall status: "ok" only if all dependencies are healthy
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

    # Return 503 when degraded so external monitors detect failures via HTTP status
    return JSONResponse(
        content=payload,
        status_code=200 if all_ok else 503,
    )


@router.get("/ping")
async def ping():
    """Lightweight liveness probe — no dependency checks."""
    return {"ping": "pong"}
