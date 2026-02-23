import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from src.config import settings

logger = logging.getLogger("egglogu")
from src.core.rate_limit import init_redis, close_redis
from src.database import engine
from src.api import (
    auth, farms, flocks, production, health, feed, clients,
    finance, environment, operations, sync,
    biosecurity, traceability, planning, billing, trace_public,
    support, healthcheck, leads,
)

# Import all models so Base.metadata knows about every table
import src.models  # noqa: F401


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
            "connect-src 'self' https://api.stripe.com https://egglogu.com; "
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
        raise RuntimeError("FATAL: JWT_SECRET_KEY is still the default. Set a strong secret in .env")

    # Tables managed by Alembic migrations — run `alembic upgrade head` before deploy
    logging.getLogger("egglogu").info("Startup: tables managed by Alembic (run 'alembic upgrade head')")
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
# 1) Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)

# 2) Global rate limit (before CORS so abusive IPs are cut early)
app.add_middleware(GlobalRateLimitMiddleware)

# 3) CORS — restricted origins, never wildcard
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
        errors.append({
            "field": ".".join(str(loc) for loc in err.get("loc", [])),
            "message": err.get("msg", "Invalid value"),
        })
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
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Keep a minimal /health for backwards-compatible container health checks
@app.get("/health")
async def health_check():
    return {"status": "ok"}
