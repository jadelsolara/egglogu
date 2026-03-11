"""Authentication & registration business logic.

Extracted from src/api/auth.py to keep routes thin.
"""

import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.auth_security import (
    check_impossible_travel,
    check_known_device,
    check_pwned,
    create_session,
    send_new_login_alert,
)
from src.core.email import (
    generate_token,
    send_verification_email,
    send_welcome,
)
from src.core.security import (
    WeakPasswordError,
    create_access_token,
    create_refresh_token,
    hash_password,
    validate_password,
)
from src.models.auth import Organization, Role, User
from src.models.subscription import PlanTier, Subscription, SubscriptionStatus

logger = logging.getLogger("egglogu.auth_service")


class AuthService:
    """Stateless auth service — all methods receive db/request explicitly."""

    # ── Slug helpers ────────────────────────────────────────────────

    @staticmethod
    def slugify(name: str) -> str:
        """Convert an org name to a URL-safe slug."""
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        return slug or "org"

    @staticmethod
    async def unique_slug(name: str, db: AsyncSession) -> str:
        """Generate a unique org slug, appending a suffix on collision."""
        base = AuthService.slugify(name)
        slug = base
        for i in range(1, 100):
            exists = await db.execute(
                select(Organization).where(Organization.slug == slug)
            )
            if not exists.scalar_one_or_none():
                return slug
            slug = f"{base}-{i}"
        return f"{base}-{secrets.token_hex(4)}"

    # ── Request helpers ─────────────────────────────────────────────

    @staticmethod
    def client_ip(request: Request) -> str:
        """Extract real client IP — Cloudflare first, then standard proxy headers."""
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
        return request.client.host if request.client else "unknown"

    @staticmethod
    def user_agent(request: Request) -> str:
        return request.headers.get("user-agent", "")

    # ── Token + session creation ────────────────────────────────────

    @staticmethod
    async def build_tokens_with_session(
        user: User, request: Request, db: AsyncSession
    ) -> dict:
        """Create access + refresh tokens and register a session."""
        refresh_token, refresh_jti = create_refresh_token(user.id)
        access_token = create_access_token(
            user.id, user.organization_id, user.role.value
        )
        await create_session(
            db=db,
            user_id=user.id,
            jti=refresh_jti,
            ip_address=AuthService.client_ip(request),
            user_agent=AuthService.user_agent(request),
        )
        return {"access_token": access_token, "refresh_token": refresh_token}

    # ── Post-login security checks ──────────────────────────────────

    @staticmethod
    async def post_login_checks(
        user: User, request: Request, db: AsyncSession
    ) -> None:
        """Run post-login security checks: known device, impossible travel, alerts."""
        ip = AuthService.client_ip(request)
        ua = AuthService.user_agent(request)

        is_known, device = await check_known_device(db, user.id, ip, ua)
        if not is_known:
            await send_new_login_alert(
                user.email, user.full_name, ip, device.device_name or "Unknown"
            )

        travel = await check_impossible_travel(db, user.id, user.geo_lat, user.geo_lng)
        if travel.get("impossible"):
            logger.warning(
                "Impossible travel detected for user %s: %s",
                user.id,
                travel["details"],
            )

    # ── Password validation ─────────────────────────────────────────

    @staticmethod
    async def validate_new_password(password: str) -> None:
        """Validate password strength + HIBP breach check. Raises on failure."""
        validate_password(password)  # raises WeakPasswordError
        breach_count = await check_pwned(password)
        if breach_count > 0:
            from src.core.exceptions import ConflictError

            raise ConflictError(
                f"This credential has appeared in {breach_count} data breaches. "
                "Please choose a different one."
            )

    # ── Registration (org + subscription + user) ────────────────────

    @staticmethod
    async def register_org_and_user(
        *,
        email: str,
        password: str,
        full_name: str,
        organization_name: str,
        db: AsyncSession,
        utm_source: str | None = None,
        utm_medium: str | None = None,
        utm_campaign: str | None = None,
        geo_country: str | None = None,
        geo_city: str | None = None,
        geo_region: str | None = None,
        geo_timezone: str | None = None,
        geo_lat: float | None = None,
        geo_lng: float | None = None,
    ) -> User:
        """Create organization + trial subscription + user. Returns the new User."""
        slug = await AuthService.unique_slug(organization_name, db)
        org = Organization(name=organization_name, slug=slug)
        db.add(org)
        await db.flush()

        sub = Subscription(
            organization_id=org.id,
            plan=PlanTier.enterprise,
            status=SubscriptionStatus.active,
            is_trial=True,
            trial_end=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(sub)

        verification_token = generate_token()
        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role=Role.owner,
            organization_id=org.id,
            verification_token=verification_token,
            utm_source=utm_source,
            utm_medium=utm_medium,
            utm_campaign=utm_campaign,
            geo_country=geo_country,
            geo_city=geo_city,
            geo_region=geo_region,
            geo_timezone=geo_timezone,
            geo_lat=geo_lat,
            geo_lng=geo_lng,
        )
        db.add(user)
        await db.flush()

        # Emails are best-effort
        try:
            await send_verification_email(email, verification_token)
            await send_welcome(email, full_name)
        except Exception as e:
            logger.error("Post-registration email failed for %s: %s", email, e)

        return user

    # ── OAuth user-or-create ────────────────────────────────────────

    @staticmethod
    async def oauth_find_or_create(
        *,
        email: str,
        name: str,
        oauth_sub: str,
        provider: str,
        organization_name: str | None,
        db: AsyncSession,
    ) -> User:
        """Find existing user by oauth_sub or email, or create new org+user.

        Shared logic for Google/Apple/Microsoft OAuth flows.
        Returns the user (caller checks is_active).
        """
        # Try by oauth sub first
        result = await db.execute(select(User).where(User.oauth_sub == oauth_sub))
        user = result.scalar_one_or_none()

        if not user:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

        if user:
            # Link OAuth if not already
            if not user.oauth_provider:
                user.oauth_provider = provider
                user.oauth_sub = oauth_sub
            if not user.email_verified:
                user.email_verified = True
                user.verification_token = None
            return user

        # New user — create org + subscription + user
        org_name = organization_name or name or email.split("@")[0]
        org = Organization(name=org_name, slug=AuthService.slugify(org_name))
        db.add(org)
        await db.flush()

        sub_obj = Subscription(
            organization_id=org.id,
            plan=PlanTier.enterprise,
            status=SubscriptionStatus.active,
            is_trial=True,
            trial_end=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(sub_obj)

        user = User(
            email=email,
            hashed_password=None,
            full_name=name or email.split("@")[0],
            role=Role.owner,
            organization_id=org.id,
            email_verified=True,
            oauth_provider=provider,
            oauth_sub=oauth_sub,
        )
        db.add(user)
        await db.flush()

        return user
