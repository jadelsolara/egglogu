"""API Versioning Strategy — router factory + deprecation middleware.

Supports:
  - Path-based versioning: /api/v1/..., /api/v2/...
  - Header-based versioning: API-Version: v1 (optional alternative)
  - Deprecation headers: Sunset + Deprecation (RFC 8594)
  - Minimum 12 months of parallel support between versions
"""

import logging

from fastapi import APIRouter
from starlette.types import ASGIApp, Receive, Scope, Send

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
    """Create an APIRouter with version prefix and metadata."""
    return APIRouter(
        tags=[f"API {version}"],
        responses={
            410: {"description": "API version has been sunset"},
        },
        **kwargs,
    )


# ─── Deprecation Middleware (Pure ASGI) ──────────────────────────────


class APIVersionMiddleware:
    """Pure ASGI: adds API versioning headers to responses.

    - Detects version from path (/api/v1/, /api/v2/) or API-Version header
    - Adds deprecation/sunset headers for deprecated versions
    - Adds X-API-Version header to all responses
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "/")
        headers = dict(scope.get("headers", []))

        # Detect version from path
        version = None
        for v in VERSIONS:
            if f"/api/{v}/" in path or path.endswith(f"/api/{v}"):
                version = v
                break

        # Fallback to header
        if not version:
            version = headers.get(b"api-version", b"").decode().lower()
            if version not in VERSIONS:
                version = CURRENT_VERSION

        # Build extra headers for this version
        extra_headers: list[tuple[bytes, bytes]] = [
            (b"x-api-version", version.encode()),
        ]
        version_info = VERSIONS.get(version, {})
        if version_info.get("status") == "deprecated":
            extra_headers.append((b"deprecation", b"true"))
            sunset = version_info.get("sunset")
            if sunset:
                extra_headers.append((b"sunset", sunset.encode()))
            extra_headers.append(
                (
                    b"link",
                    f'</api/{CURRENT_VERSION}/>; rel="successor-version"'.encode(),
                )
            )
            method = scope.get("method", "?")
            logger.debug("Deprecated API %s used: %s %s", version, method, path)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                raw_headers = list(message.get("headers", []))
                raw_headers.extend(extra_headers)
                message = {**message, "headers": raw_headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


def deprecate_version(version: str, sunset_date: str) -> None:
    """Mark an API version as deprecated with a sunset date."""
    if version in VERSIONS:
        VERSIONS[version]["status"] = "deprecated"
        VERSIONS[version]["sunset"] = sunset_date
        logger.info("API %s deprecated, sunset: %s", version, sunset_date)
