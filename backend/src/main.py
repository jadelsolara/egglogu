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

from src.api.versioning import APIVersionMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

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
from src.database import engine, async_session
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
    superadmin_crm,
    superadmin_intelligence,
    reports,
    workflows,
    webhooks,
    api_keys,
    plugins,
    animal_welfare,
    community,
    accounting,
    trace_events,
    farmlogu,
    websocket as ws_routes,
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


# ── Pure ASGI Middleware ──────────────────────────────────────────────
# CRITICAL: All middleware use pure ASGI protocol (not BaseHTTPMiddleware).
# BaseHTTPMiddleware runs call_next() in a separate asyncio task, which
# creates task boundary issues with asyncpg connections (causes
# "cannot use Connection.transaction() in a manually started transaction").
# Pure ASGI middleware runs in the SAME task as the request handler,
# eliminating the asyncpg transaction conflict entirely.
# ─────────────────────────────────────────────────────────────────────


class RequestLoggingMiddleware:
    """Pure ASGI: assigns request_id, logs method/path/status/duration."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        request_id = (
            headers.get(b"x-request-id", b"").decode() or str(_uuid.uuid4())[:8]
        )
        scope.setdefault("state", {})["request_id"] = request_id

        method = scope.get("method", "WS")
        path = scope.get("path", "/")
        start = time.perf_counter()
        status_code = 500  # default if send is never called

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                # Inject X-Request-ID header
                raw_headers = list(message.get("headers", []))
                raw_headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": raw_headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000)
            _metrics["request_count"] += 1
            _metrics["latencies"].append(duration_ms)
            _metrics["status_codes"][status_code] += 1
            if status_code >= 500:
                _metrics["error_count"] += 1
            logger.info(
                "%s %s → %d (%dms)",
                method,
                path,
                status_code,
                duration_ms,
                extra={"request_id": request_id},
            )


class AuditContextMiddleware:
    """Pure ASGI: injects audit context (IP, user-agent) into ContextVars."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        from src.core.audit import audit_ip, audit_user_agent

        headers = dict(scope.get("headers", []))
        client = scope.get("client")
        client_ip = client[0] if client else None
        ua = headers.get(b"user-agent", b"").decode()[:500]

        token_ip = audit_ip.set(client_ip)
        token_ua = audit_user_agent.set(ua)
        try:
            await self.app(scope, receive, send)
        finally:
            audit_ip.reset(token_ip)
            audit_user_agent.reset(token_ua)


class SecurityHeadersMiddleware:
    """Pure ASGI: injects security headers (CSP, HSTS, X-Frame, etc.)."""

    CSP = (
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

    SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
        (b"content-security-policy", CSP.encode()),
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (
            b"permissions-policy",
            b"camera=(), microphone=(), geolocation=(), payment=(self)",
        ),
    ]

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._extra_headers = list(self.SECURITY_HEADERS)
        if settings.FRONTEND_URL.startswith("https"):
            self._extra_headers.append(
                (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
            )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers", []))
                raw_headers.extend(self._extra_headers)
                message = {**message, "headers": raw_headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


class GlobalRateLimitMiddleware:
    """Pure ASGI: blanket 120-req/min per IP. Uses CF-Connecting-IP for real client IP."""

    MAX_REQUESTS = 120
    WINDOW_SECONDS = 60
    EXEMPT_PATHS = {b"/health", b"/healthcheck", b"/api/healthcheck"}

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "/").encode()
        if path in self.EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return

        from src.core.rate_limit import check_rate_limit

        headers = dict(scope.get("headers", []))
        # Priority: CF-Connecting-IP (Cloudflare real IP) > X-Forwarded-For > X-Real-IP > client
        cf_ip = headers.get(b"cf-connecting-ip", b"").decode().strip()
        if cf_ip:
            client_ip = cf_ip
        else:
            forwarded = headers.get(b"x-forwarded-for", b"").decode()
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
            else:
                real_ip = headers.get(b"x-real-ip", b"").decode().strip()
                if real_ip:
                    client_ip = real_ip
                else:
                    client = scope.get("client")
                    client_ip = client[0] if client else "unknown"

        allowed = await check_rate_limit(
            f"global:{client_ip}", self.MAX_REQUESTS, self.WINDOW_SECONDS
        )
        if not allowed:
            response = Response(
                content='{"detail":"Too many requests. Slow down."}',
                status_code=429,
                media_type="application/json",
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


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

    # Initialize audit trail (hash-chain listeners + cache)
    from src.core.audit import setup_audit_listeners, initialize_hash_cache

    setup_audit_listeners()
    async with async_session() as db:
        await initialize_hash_cache(db)

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

# ── Pure ASGI Middleware Stack ──────────────────────────────────────
# All middleware are pure ASGI (not BaseHTTPMiddleware) to prevent
# asyncpg task boundary conflicts. Order: outermost runs first.

# 1) Request ID + structured logging (outermost — captures everything)
app.add_middleware(RequestLoggingMiddleware)

# 2) API versioning headers (deprecation, sunset)
app.add_middleware(APIVersionMiddleware)

# 3) Audit context (IP, user-agent) for hash-chain audit trail
app.add_middleware(AuditContextMiddleware)

# 4) Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# 5) Global rate limit (before CORS so abusive IPs are cut early)
app.add_middleware(GlobalRateLimitMiddleware)

# 5) GZip compression for responses > 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)

# 6) CORS — restricted origins, never wildcard
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
app.include_router(superadmin_crm.router, prefix=prefix)
app.include_router(superadmin_intelligence.router, prefix=prefix)
app.include_router(reports.router, prefix=prefix)
app.include_router(workflows.router, prefix=prefix)
app.include_router(webhooks.router, prefix=prefix)
app.include_router(api_keys.router, prefix=prefix)
app.include_router(plugins.router, prefix=prefix)
app.include_router(animal_welfare.router, prefix=prefix)
app.include_router(community.router, prefix=prefix)
app.include_router(accounting.router, prefix=prefix)
app.include_router(trace_events.router, prefix=prefix)
app.include_router(farmlogu.router, prefix=prefix)

# Public routes (no /api/v1 prefix)
app.include_router(trace_public.router)
app.include_router(leads.router, prefix="/api")

# WebSocket routes (no version prefix — ws://host/ws/...)
app.include_router(ws_routes.router)

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


@app.get("/metrics", include_in_schema=False)
async def metrics(request: Request):
    """Internal metrics endpoint — requires Bearer token or localhost access."""
    # Only allow from localhost or with valid auth token
    client = request.client
    client_ip = client.host if client else "unknown"
    is_local = client_ip in ("127.0.0.1", "::1", "localhost")
    auth_header = request.headers.get("authorization", "")
    has_token = auth_header.startswith("Bearer ") and len(auth_header) > 10
    if not is_local and not has_token:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
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
