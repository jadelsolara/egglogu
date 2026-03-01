import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ForbiddenError, UnauthorizedError
from src.core.plans import check_feature_access
from src.core.security import decode_token
from src.database import get_db
from src.models.auth import Role, User
from src.models.subscription import Subscription, SubscriptionStatus

logger = logging.getLogger("egglogu.deps")

bearer_scheme = HTTPBearer(auto_error=False)


def is_superadmin(user: User) -> bool:
    return user.role == Role.superadmin


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError()
    try:
        payload = decode_token(credentials.credentials)
    except ValueError:
        raise UnauthorizedError()
    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError()
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError()
    return user


def require_role(*roles: str) -> Callable:
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        if is_superadmin(user):
            return user
        if user.role.value not in roles:
            raise ForbiddenError()
        return user

    return role_checker


def require_superadmin() -> Callable:
    async def superadmin_checker(user: User = Depends(get_current_user)) -> User:
        if not is_superadmin(user):
            raise ForbiddenError("Superadmin access required")
        return user

    return superadmin_checker


def get_org_filter(user: User):
    return user.organization_id


_SUB_CACHE_TTL = 600  # 10 minutes


async def get_subscription(org_id: uuid.UUID, db: AsyncSession) -> Subscription | None:
    """Fetch subscription with Redis cache (TTL 10 min). Falls back to DB on cache miss."""
    from src.core.rate_limit import _redis

    cache_key = f"sub:{org_id}"

    # Try cache first
    if _redis:
        try:
            cached = await _redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                # Reconstruct Subscription from cached data
                sub = Subscription()
                for k, v in data.items():
                    if k == "plan":
                        from src.models.subscription import PlanTier

                        v = PlanTier(v)
                    elif k == "status":
                        v = SubscriptionStatus(v)
                    elif (
                        k
                        in (
                            "trial_end",
                            "current_period_end",
                            "created_at",
                            "updated_at",
                        )
                        and v
                    ):
                        v = datetime.fromisoformat(v)
                    elif k in ("id", "organization_id") and v:
                        v = uuid.UUID(v)
                    setattr(sub, k, v)
                return sub
        except Exception as e:
            logger.debug("Sub cache read failed (key=%s): %s", cache_key, e)

    # DB fallback
    result = await db.execute(
        select(Subscription).where(Subscription.organization_id == org_id)
    )
    sub = result.scalar_one_or_none()

    # Write to cache
    if sub and _redis:
        try:
            cache_data = {
                "id": str(sub.id),
                "organization_id": str(sub.organization_id),
                "plan": sub.plan.value,
                "status": sub.status.value,
                "is_trial": sub.is_trial,
                "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
                "stripe_subscription_id": sub.stripe_subscription_id,
                "stripe_customer_id": sub.stripe_customer_id,
                "discount_phase": sub.discount_phase,
                "months_subscribed": sub.months_subscribed,
                "billing_interval": sub.billing_interval,
                "current_period_end": sub.current_period_end.isoformat()
                if sub.current_period_end
                else None,
            }
            await _redis.setex(cache_key, _SUB_CACHE_TTL, json.dumps(cache_data))
        except Exception as e:
            logger.debug("Sub cache write failed (key=%s): %s", cache_key, e)

    return sub


async def invalidate_subscription_cache(org_id: uuid.UUID) -> None:
    """Call this after Stripe webhook or plan change to bust cache."""
    from src.core.rate_limit import _redis

    if _redis:
        try:
            await _redis.delete(f"sub:{org_id}")
        except Exception:
            pass


def _is_trial_expired(sub: Subscription) -> bool:
    """Check if a trial subscription has expired."""
    if not sub.is_trial or not sub.trial_end:
        return False
    trial_end = sub.trial_end
    if trial_end.tzinfo is None:
        trial_end = trial_end.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > trial_end


async def _resolve_plan(sub: Subscription | None, db: AsyncSession) -> str:
    """Resolve effective plan, auto-suspending expired trials."""
    if not sub:
        return "suspended"
    if sub.status == SubscriptionStatus.suspended:
        return "suspended"
    if sub.status != SubscriptionStatus.active:
        return "suspended"
    # Trial expired and no Stripe subscription → suspend
    if sub.is_trial and _is_trial_expired(sub) and not sub.stripe_subscription_id:
        sub.status = SubscriptionStatus.suspended
        sub.is_trial = False
        await db.flush()
        await invalidate_subscription_cache(sub.organization_id)
        return "suspended"
    return sub.plan.value


async def get_org_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    if is_superadmin(user):
        return "enterprise"
    sub = await get_subscription(user.organization_id, db)
    return await _resolve_plan(sub, db)


def require_plan(*plans: str) -> Callable:
    async def plan_checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if is_superadmin(user):
            return user
        sub = await get_subscription(user.organization_id, db)
        current_plan = await _resolve_plan(sub, db)
        if current_plan == "suspended":
            raise ForbiddenError(
                "Your trial has ended. Choose a plan to continue using EGGlogU."
            )
        if current_plan not in plans:
            raise ForbiddenError(
                f"This feature requires one of these plans: {', '.join(plans)}. "
                f"Current plan: {current_plan}."
            )
        return user

    return plan_checker


def require_feature(feature: str) -> Callable:
    async def feature_checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if is_superadmin(user):
            return user
        sub = await get_subscription(user.organization_id, db)
        current_plan = await _resolve_plan(sub, db)
        if current_plan == "suspended":
            raise ForbiddenError(
                "Your trial has ended. Choose a plan to continue using EGGlogU."
            )
        check_feature_access(current_plan, feature)
        return user

    return feature_checker
