import uuid
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ForbiddenError, UnauthorizedError
from src.core.plans import check_feature_access, get_plan_limits
from src.core.security import decode_token
from src.database import get_db
from src.models.auth import User
from src.models.subscription import Subscription, SubscriptionStatus

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
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
        if user.role.value not in roles:
            raise ForbiddenError()
        return user
    return role_checker


def get_org_filter(user: User):
    return user.organization_id


async def get_subscription(org_id: uuid.UUID, db: AsyncSession) -> Subscription | None:
    result = await db.execute(
        select(Subscription).where(Subscription.organization_id == org_id)
    )
    return result.scalar_one_or_none()


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
        return "suspended"
    return sub.plan.value


async def get_org_plan(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> str:
    sub = await get_subscription(user.organization_id, db)
    return await _resolve_plan(sub, db)


def require_plan(*plans: str) -> Callable:
    async def plan_checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
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
        sub = await get_subscription(user.organization_id, db)
        current_plan = await _resolve_plan(sub, db)
        if current_plan == "suspended":
            raise ForbiddenError(
                "Your trial has ended. Choose a plan to continue using EGGlogU."
            )
        check_feature_access(current_plan, feature)
        return user
    return feature_checker
