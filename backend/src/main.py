import json
import logging
import os
import time
import traceback
import uuid as _uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

import src.models  # noqa: F401, E402
from src.config import settings

# ── Sentry Error Tracking ────────────────────────────────────────
if settings.SENTRY_DSN:
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.05,
        profiles_sample_rate=0.05,
        environment="production"
        if "egglogu.com" in settings.FRONTEND_URL
        else "development",
        send_default_pii=False,
    )
from src.core.rate_limit import init_redis, close_redis
from src.database import engine
from src.api import (
    analytics,
    auth,
    farms,
    flocks,
    production,
    health,
    feed,
    clients,
    finance,
    environment,
    operations,
    sync,
    biosecurity,
    traceability,
    planning,
    billing,
    trace_public,
    support,
    healthcheck,
    leads,
    inventory,
    grading,
    purchase_orders,
    audit,
    compliance,
    cost_centers,
    superadmin,
)


# ── Structured JSON Logging ────────────────────────────────────────
class JSONFormatter(logging.Formatter):
    """Emit log records as single-line JSON for structured log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


setup_logging()

logger = logging.getLogger("egglogu")


# ── In-Memory Metrics Collector ─────────────────────────────────────
_METRICS_WINDOW = 1000  # Keep last 1000 request latencies
_metrics = {
    "request_count": 0,
    "error_count": 0,
    "latencies": deque(maxlen=_METRICS_WINDOW),
    "status_codes": defaultdict(int),
    "started_at": time.time(),
}


# ── Request ID + Logging Middleware ─────────────────────────────────
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Assigns a request_id, logs method/path/status/duration for every request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(_uuid.uuid4())[:8])
        request.state.request_id = request_id

        start = time.perf_counter()
        response: Response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000)

        # Collect metrics
        _metrics["request_count"] += 1
        _metrics["latencies"].append(duration_ms)
        _metrics["status_codes"][response.status_code] += 1
        if response.status_code >= 500:
            _metrics["error_count"] += 1

        logger.info(
            "%s %s → %d (%dms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            extra={"request_id": request_id},
        )
        response.headers["X-Request-ID"] = request_id
        return response


# ── Security Headers Middleware ──────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects security headers (CSP, HSTS, X-Frame, etc.) into every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Content-Security-Policy — strict, no unsafe-inline
        # 'self' for scripts/styles/images; data: for inline images (favicons);
        # connect-src allows API calls to self + Stripe + Sentry.
        csp_directives = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self' https://api.stripe.com https://egglogu.com https://*.sentry.io; worker-src 'self' blob:; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "base-uri 'self'; "
            "object-src 'none'"
        )
        response.headers["Content-Security-Policy"] = csp_directives

        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Deny framing (clickjacking protection)
        response.headers["X-Frame-Options"] = "DENY"

        # Only send origin as referrer to external sites
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # HSTS — 1 year, include subdomains (only when serving over HTTPS)
        if settings.FRONTEND_URL.startswith("https"):
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Disable browser features the app does not need
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(self)"
        )

        return response


# ── Global Rate-Limit Middleware ─────────────────────────────────────
class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """Blanket 120-req/min per IP.  Endpoint-specific limits remain in routes."""

    MAX_REQUESTS = 120
    WINDOW_SECONDS = 60

    async def dispatch(self, request: Request, call_next) -> Response:
        from src.core.rate_limit import check_rate_limit  # deferred import

        client_ip = request.client.host if request.client else "unknown"
        allowed = await check_rate_limit(
            f"global:{client_ip}", self.MAX_REQUESTS, self.WINDOW_SECONDS
        )
        if not allowed:
            return Response(
                content='{"detail":"Too many requests. Slow down."}',
                status_code=429,
                media_type="application/json",
            )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if JWT secret is still the default
    if settings.JWT_SECRET_KEY == "change-me-in-production":
        raise RuntimeError(
            "FATAL: JWT_SECRET_KEY is still the default. Set a strong secret in .env"
        )

    # Tables managed by Alembic migrations — run `alembic upgrade head` before deploy
    logging.getLogger("egglogu").info(
        "Startup: tables managed by Alembic (run 'alembic upgrade head')"
    )
    await init_redis()
    yield
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="EGGlogU API",
    version="3.0.0",
    lifespan=lifespan,
    # Hide schema/docs in production to reduce attack surface
    docs_url="/docs" if settings.FRONTEND_URL != "https://egglogu.com" else None,
    redoc_url="/redoc" if settings.FRONTEND_URL != "https://egglogu.com" else None,
)

# Middleware order matters: outermost runs first.
# 1) Request ID + structured logging (outermost — captures everything)
app.add_middleware(RequestLoggingMiddleware)

# 2) Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# 3) Global rate limit (before CORS so abusive IPs are cut early)
app.add_middleware(GlobalRateLimitMiddleware)

# 4) GZip compression for responses > 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)

# 5) CORS — restricted origins, never wildcard
allowed_origins = [settings.FRONTEND_URL]
if settings.FRONTEND_URL != "https://egglogu.com":
    allowed_origins.append("http://localhost:3000")
    allowed_origins.append("http://localhost:8080")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

prefix = "/api/v1"
app.include_router(auth.router, prefix=prefix)
app.include_router(farms.router, prefix=prefix)
app.include_router(flocks.router, prefix=prefix)
app.include_router(production.router, prefix=prefix)
app.include_router(health.router, prefix=prefix)
app.include_router(feed.router, prefix=prefix)
app.include_router(clients.router, prefix=prefix)
app.include_router(finance.router, prefix=prefix)
app.include_router(environment.router, prefix=prefix)
app.include_router(operations.router, prefix=prefix)
app.include_router(sync.router, prefix=prefix)
app.include_router(biosecurity.router, prefix=prefix)
app.include_router(traceability.router, prefix=prefix)
app.include_router(planning.router, prefix=prefix)
app.include_router(billing.router, prefix=prefix)
app.include_router(support.router, prefix=prefix)
app.include_router(analytics.router, prefix=prefix)

app.include_router(inventory.router, prefix=prefix)
app.include_router(grading.router, prefix=prefix)
app.include_router(purchase_orders.router, prefix=prefix)
app.include_router(audit.router, prefix=prefix)
app.include_router(compliance.router, prefix=prefix)
app.include_router(cost_centers.router, prefix=prefix)
app.include_router(superadmin.router, prefix=prefix)

# Public routes (no /api/v1 prefix)
app.include_router(trace_public.router)
app.include_router(leads.router, prefix="/api")

# System health check at /api/health (no version prefix — standard path for LBs)
app.include_router(healthcheck.router, prefix="/api")

# ── Global Exception Handlers ────────────────────────────────────────


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return clean 422 without exposing internal schema details."""
    errors = []
    for err in exc.errors():
        errors.append(
            {
                "field": ".".join(str(loc) for loc in err.get("loc", [])),
                "message": err.get("msg", "Invalid value"),
            }
        )
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all: log the traceback, return generic 500 — never leak stack traces."""
    logger.error(
        "Unhandled exception on %s %s: %s\n%s",
        request.method,
        request.url.path,
        exc,
        traceback.format_exc(),
    )
    sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Keep a minimal /health for backwards-compatible container health checks
@app.get("/health")
async def health_check():
    return JSONResponse(
        content={"status": "ok"},
        headers={"Cache-Control": "no-cache, no-store"},
    )


@app.get("/metrics")
async def metrics():
    """Internal metrics endpoint for monitoring. Not public — behind reverse proxy."""
    latencies = list(_metrics["latencies"])
    if latencies:
        latencies_sorted = sorted(latencies)
        n = len(latencies_sorted)
        p50 = latencies_sorted[int(n * 0.50)]
        p95 = latencies_sorted[int(n * 0.95)]
        p99 = latencies_sorted[min(int(n * 0.99), n - 1)]
        avg = round(sum(latencies_sorted) / n, 1)
    else:
        p50 = p95 = p99 = avg = 0

    uptime_s = round(time.time() - _metrics["started_at"])
    total = _metrics["request_count"]
    errors = _metrics["error_count"]
    error_rate = round((errors / total * 100), 2) if total > 0 else 0

    return JSONResponse(
        content={
            "uptime_seconds": uptime_s,
            "total_requests": total,
            "error_count": errors,
            "error_rate_pct": error_rate,
            "latency_ms": {"p50": p50, "p95": p95, "p99": p99, "avg": avg},
            "status_codes": dict(_metrics["status_codes"]),
            "workers": int(os.environ.get("WEB_CONCURRENCY", 4)),
        },
        headers={"Cache-Control": "no-cache, no-store"},
    )
