import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.email import (
    generate_token,
    send_password_reset,
    send_team_invite,
    send_verification_email,
    send_welcome,
)
from src.core.exceptions import (
    ConflictError,
    NotFoundError,
    RateLimitError,
    UnauthorizedError,
)
from src.core.rate_limit import check_rate_limit
from src.core.security import (
    WeakPasswordError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password,
    verify_password,
)
from src.database import get_db
from src.models.auth import Organization, Role, User
from src.models.subscription import Subscription, PlanTier, SubscriptionStatus
from src.schemas.auth import (
    AppleAuthRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    MessageResponse,
    MicrosoftAuthRequest,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TeamInviteRequest,
    TokenResponse,
    UserCreate,
    UserRead,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config")
async def auth_config():
    """Public endpoint — returns OAuth client IDs for frontend initialization."""
    from src.config import settings

    return {
        "google_client_id": settings.GOOGLE_CLIENT_ID or None,
        "apple_client_id": settings.APPLE_CLIENT_ID or None,
        "microsoft_client_id": settings.MICROSOFT_CLIENT_ID or None,
        "microsoft_tenant_id": settings.MICROSOFT_TENANT_ID or None,
    }


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug


@router.post(
    "/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED
)
async def register(
    data: UserCreate, request: Request, db: AsyncSession = Depends(get_db)
):
    # Rate limit: 5 registrations per IP per hour
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"register:{client_ip}", 5, 3600):
        raise RateLimitError("Too many registrations. Try again in 1 hour.")

    try:
        validate_password(data.password)
    except WeakPasswordError as e:
        raise ConflictError(str(e))

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    org = Organization(
        name=data.organization_name, slug=_slugify(data.organization_name)
    )
    db.add(org)
    await db.flush()

    # Create Enterprise trial subscription (30 days free)
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
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=Role.owner,
        organization_id=org.id,
        verification_token=verification_token,
        utm_source=data.utm_source,
        utm_medium=data.utm_medium,
        utm_campaign=data.utm_campaign,
        geo_country=data.geo_country,
        geo_city=data.geo_city,
        geo_region=data.geo_region,
        geo_timezone=data.geo_timezone,
        geo_lat=data.geo_lat,
        geo_lng=data.geo_lng,
    )
    db.add(user)
    await db.flush()

    await send_verification_email(data.email, verification_token)
    await send_welcome(data.email, data.full_name)

    return MessageResponse(message="Account created. Check your email to verify.")


@router.post("/google", response_model=TokenResponse)
async def google_auth(
    data: GoogleAuthRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token as google_id_token

    from src.config import settings

    if not settings.GOOGLE_CLIENT_ID:
        raise UnauthorizedError("Google Sign-In is not configured")

    # Rate limit: 10 per IP per 15 minutes
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"google:{client_ip}", 10, 900):
        raise RateLimitError("Too many attempts. Try again in 15 minutes.")

    try:
        payload = google_id_token.verify_oauth2_token(
            data.credential, GoogleRequest(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise UnauthorizedError("Invalid Google token")

    email = payload.get("email")
    name = payload.get("name", "")
    sub = payload.get("sub")
    if not email or not sub:
        raise UnauthorizedError("Invalid Google token payload")

    # Look up by oauth_sub first, then by email
    result = await db.execute(select(User).where(User.oauth_sub == sub))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        # Existing user — link OAuth if not already linked
        if not user.oauth_provider:
            user.oauth_provider = "google"
            user.oauth_sub = sub
        if not user.email_verified:
            user.email_verified = True
            user.verification_token = None
        if not user.is_active:
            raise UnauthorizedError("Account is disabled")
    else:
        # New user — create org + user
        org_name = data.organization_name or name or email.split("@")[0]
        org = Organization(name=org_name, slug=_slugify(org_name))
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
            oauth_provider="google",
            oauth_sub=sub,
        )
        db.add(user)
        await db.flush()

    return TokenResponse(
        access_token=create_access_token(
            user.id, user.organization_id, user.role.value
        ),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/apple", response_model=TokenResponse)
async def apple_auth(
    data: AppleAuthRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    import jwt
    from src.config import settings

    if not settings.APPLE_CLIENT_ID:
        raise UnauthorizedError("Apple Sign-In is not configured")

    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"apple:{client_ip}", 10, 900):
        raise RateLimitError("Too many attempts. Try again in 15 minutes.")

    # Fetch Apple's public keys and verify the id_token
    import httpx

    try:
        async with httpx.AsyncClient() as http:
            keys_resp = await http.get("https://appleid.apple.com/auth/keys")
            apple_keys = keys_resp.json()
        header = jwt.get_unverified_header(data.id_token)
        key = None
        for k in apple_keys.get("keys", []):
            if k["kid"] == header["kid"]:
                key = jwt.algorithms.RSAAlgorithm.from_jwk(k)
                break
        if not key:
            raise UnauthorizedError("Invalid Apple token — key not found")
        payload = jwt.decode(
            data.id_token,
            key,
            algorithms=["RS256"],
            audience=settings.APPLE_CLIENT_ID,
            issuer="https://appleid.apple.com",
        )
    except jwt.PyJWTError:
        raise UnauthorizedError("Invalid Apple token")

    email = payload.get("email")
    sub = payload.get("sub")
    if not email or not sub:
        raise UnauthorizedError("Invalid Apple token payload")

    name = data.full_name or email.split("@")[0]

    # Look up by oauth_sub first, then by email
    result = await db.execute(select(User).where(User.oauth_sub == sub))
    user = result.scalar_one_or_none()
    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        if not user.oauth_provider:
            user.oauth_provider = "apple"
            user.oauth_sub = sub
        if not user.email_verified:
            user.email_verified = True
            user.verification_token = None
        if not user.is_active:
            raise UnauthorizedError("Account is disabled")
    else:
        org_name = data.organization_name or name
        org = Organization(name=org_name, slug=_slugify(org_name))
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
            full_name=name,
            role=Role.owner,
            organization_id=org.id,
            email_verified=True,
            oauth_provider="apple",
            oauth_sub=sub,
        )
        db.add(user)
        await db.flush()

    return TokenResponse(
        access_token=create_access_token(
            user.id, user.organization_id, user.role.value
        ),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/microsoft", response_model=TokenResponse)
async def microsoft_auth(
    data: MicrosoftAuthRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    from src.config import settings

    if not settings.MICROSOFT_CLIENT_ID:
        raise UnauthorizedError("Microsoft Sign-In is not configured")

    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"microsoft:{client_ip}", 10, 900):
        raise RateLimitError("Too many attempts. Try again in 15 minutes.")

    # Validate token by calling Microsoft Graph /me endpoint
    import httpx

    try:
        async with httpx.AsyncClient() as http:
            graph_resp = await http.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {data.access_token}"},
            )
            if graph_resp.status_code != 200:
                raise UnauthorizedError("Invalid Microsoft token")
            profile = graph_resp.json()
    except httpx.HTTPError:
        raise UnauthorizedError("Failed to verify Microsoft token")

    email = profile.get("mail") or profile.get("userPrincipalName")
    name = profile.get("displayName", "")
    sub = profile.get("id")
    if not email or not sub:
        raise UnauthorizedError("Invalid Microsoft profile — missing email")

    # Look up by oauth_sub first, then by email
    result = await db.execute(select(User).where(User.oauth_sub == sub))
    user = result.scalar_one_or_none()
    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        if not user.oauth_provider:
            user.oauth_provider = "microsoft"
            user.oauth_sub = sub
        if not user.email_verified:
            user.email_verified = True
            user.verification_token = None
        if not user.is_active:
            raise UnauthorizedError("Account is disabled")
    else:
        org_name = data.organization_name or name or email.split("@")[0]
        org = Organization(name=org_name, slug=_slugify(org_name))
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
            oauth_provider="microsoft",
            oauth_sub=sub,
        )
        db.add(user)
        await db.flush()

    return TokenResponse(
        access_token=create_access_token(
            user.id, user.organization_id, user.role.value
        ),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    # Rate limit: 10 login attempts per IP per 15 minutes
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"login:{client_ip}", 10, 900):
        raise RateLimitError("Too many login attempts. Try again in 15 minutes.")

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedError("Invalid email or password")
    if user.hashed_password is None:
        raise UnauthorizedError(
            "Esta cuenta usa Google Sign-In. Usa el botón 'Continuar con Google'."
        )
    if not verify_password(data.password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")
    if not user.is_active:
        raise UnauthorizedError("Account is disabled")
    if not user.email_verified:
        raise UnauthorizedError(
            "Email not verified. Check your inbox or resend verification."
        )

    return TokenResponse(
        access_token=create_access_token(
            user.id, user.organization_id, user.role.value
        ),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    data: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    # Rate limit: 30 refreshes per IP per 15 minutes
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"refresh:{client_ip}", 30, 900):
        raise RateLimitError("Too many refresh attempts. Try again later.")

    try:
        payload = decode_token(data.refresh_token)
    except ValueError:
        raise UnauthorizedError("Invalid refresh token")
    if payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid token type")

    result = await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError()

    return TokenResponse(
        access_token=create_access_token(
            user.id, user.organization_id, user.role.value
        ),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    data: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    # Rate limit: 3 password reset requests per IP per hour
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"forgot:{client_ip}", 3, 3600):
        raise RateLimitError("Too many password reset requests. Try again in 1 hour.")

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    # Always return success to prevent email enumeration
    if user:
        token = generate_token()
        user.reset_token = token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.flush()
        await send_password_reset(data.email, token)
    return MessageResponse(message="If the email exists, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.reset_token == data.token))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("Invalid or expired reset token")
    if user.reset_token_expires and user.reset_token_expires < datetime.now(
        timezone.utc
    ):
        raise NotFoundError("Reset token has expired")

    try:
        validate_password(data.new_password)
    except WeakPasswordError as e:
        raise ConflictError(str(e))

    user.hashed_password = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.flush()
    return MessageResponse(message="Password has been reset successfully.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.hashed_password:
        raise ConflictError(
            "Account uses social login. Set a password via forgot-password first."
        )
    if not verify_password(data.current_password, user.hashed_password):
        raise UnauthorizedError("Current password is incorrect")
    try:
        validate_password(data.new_password)
    except WeakPasswordError as e:
        raise ConflictError(str(e))
    user.hashed_password = hash_password(data.new_password)
    await db.flush()
    return MessageResponse(message="Password changed successfully.")


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(
    data: VerifyEmailRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    # Rate limit: 10 verification attempts per IP per 15 minutes
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"verify:{client_ip}", 10, 900):
        raise RateLimitError("Too many verification attempts. Try again later.")

    result = await db.execute(select(User).where(User.verification_token == data.token))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("Invalid verification token")
    if user.email_verified:
        # Already verified — still return tokens so user can proceed
        return TokenResponse(
            access_token=create_access_token(
                user.id, user.organization_id, user.role.value
            ),
            refresh_token=create_refresh_token(user.id),
        )

    user.email_verified = True
    user.verification_token = None
    await db.flush()

    # Return tokens so user is auto-logged-in after verification
    return TokenResponse(
        access_token=create_access_token(
            user.id, user.organization_id, user.role.value
        ),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    data: ResendVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Rate limit: 1 resend per email per 2 minutes
    if not await check_rate_limit(f"resend:{data.email}", 1, 120):
        raise RateLimitError("Verification email already sent. Wait 2 minutes.")

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    # Always return success to prevent email enumeration
    if user and not user.email_verified:
        token = generate_token()
        user.verification_token = token
        await db.flush()
        await send_verification_email(data.email, token)
    return MessageResponse(
        message="If the email exists and is not verified, a new link has been sent."
    )


@router.post("/send-team-invite", response_model=MessageResponse)
async def send_team_invite_endpoint(data: TeamInviteRequest, request: Request):
    # Rate limit: 10 invites per IP per hour
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"team_invite:{client_ip}", 10, 3600):
        raise RateLimitError("Too many invitations. Try again in 1 hour.")

    await send_team_invite(
        email=data.email,
        member_name=data.member_name,
        role=data.role,
        org_name=data.organization_name,
        invited_by=data.invited_by,
    )
    return MessageResponse(message="Team invitation email sent.")
