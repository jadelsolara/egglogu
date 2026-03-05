"""API Versioning Strategy — router factory + deprecation middleware.

Supports:
  - Path-based versioning: /api/v1/..., /api/v2/...
  - Header-based versioning: API-Version: v1 (optional alternative)
  - Deprecation headers: Sunset + Deprecation (RFC 8594)
  - Minimum 12 months of parallel support between versions
"""

import logging

from fastapi import APIRouter, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("egglogu.versioning")

# ─── Version Registry ────────────────────────────────────────────────

VERSIONS = {
    "v1": {
        "status": "stable",
        "released": "2025-01-01",
        "sunset": None,  # No sunset date yet — v1 is current
    },
    "v2": {
        "status": "beta",
        "released": "2026-03-01",
        "sunset": None,
    },
}

CURRENT_VERSION = "v1"


def create_versioned_router(version: str = "v1", **kwargs) -> APIRouter:
    """Create an APIRouter with version prefix and metadata.

    Usage:
        v1_router = create_versioned_router("v1")
        v1_router.include_router(farms.router)
        app.include_router(v1_router, prefix="/api/v1")

        v2_router = create_versioned_router("v2")
        v2_router.include_router(farms_v2.router)
        app.include_router(v2_router, prefix="/api/v2")
    """
    return APIRouter(
        tags=[f"API {version}"],
        responses={
            410: {"description": "API version has been sunset"},
        },
        **kwargs,
    )


# ─── Deprecation Middleware ──────────────────────────────────────────


class APIVersionMiddleware(BaseHTTPMiddleware):
    """Adds API versioning headers to responses.

    - Detects version from path (/api/v1/, /api/v2/) or API-Version header
    - Adds deprecation/sunset headers for deprecated versions
    - Adds X-API-Version header to all responses
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Detect version from path
        path = request.url.path
        version = None
        for v in VERSIONS:
            if f"/api/{v}/" in path or path.endswith(f"/api/{v}"):
                version = v
                break

        # Fallback to header
        if not version:
            version = request.headers.get("API-Version", "").lower()
            if version not in VERSIONS:
                version = CURRENT_VERSION

        response: Response = await call_next(request)

        # Always include current version in response
        response.headers["X-API-Version"] = version

        # Add deprecation/sunset headers for deprecated versions
        version_info = VERSIONS.get(version, {})
        if version_info.get("status") == "deprecated":
            response.headers["Deprecation"] = "true"
            sunset = version_info.get("sunset")
            if sunset:
                response.headers["Sunset"] = sunset
            response.headers["Link"] = (
                f'</api/{CURRENT_VERSION}/>; rel="successor-version"'
            )
            logger.debug("Deprecated API %s used: %s %s", version, request.method, path)

        return response


def deprecate_version(version: str, sunset_date: str) -> None:
    """Mark an API version as deprecated with a sunset date.

    Args:
        version: Version string (e.g., "v1")
        sunset_date: ISO date string (e.g., "2027-06-01")
    """
    if version in VERSIONS:
        VERSIONS[version]["status"] = "deprecated"
        VERSIONS[version]["sunset"] = sunset_date
        logger.info("API %s deprecated, sunset: %s", version, sunset_date)
