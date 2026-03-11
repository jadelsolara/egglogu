import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.auth_security import (
    blacklist_all_user_tokens,
    blacklist_token,
    check_pwned,
    clear_failed_logins,
    create_oauth_state,
    create_session,
    is_account_locked,
    is_token_blacklisted,
    list_user_sessions,
    log_login_attempt,
    record_failed_login,
    revoke_session,
    rotate_refresh_session,
)
from src.core.email import (
    generate_token,
    send_password_reset,
    send_reassignment_notification,
    send_team_invite,
    send_verification_email,
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
from src.models.security import LoginResult, UserTOTP
from src.models.subscription import PlanTier, Subscription, SubscriptionStatus
from src.services.auth_service import AuthService
from src.schemas.auth import (
    AppleAuthRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    MessageResponse,
    MicrosoftAuthRequest,
    ReassignmentNotifyRequest,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TeamInviteRequest,
    UserCreate,
    UserRead,
    UserUpdate,
    VerifyEmailRequest,
)
from src.schemas.security import (
    LogoutRequest,
    OAuthStateResponse,
    SessionRead,
    TokenResponseExtended,
    TOTPDisableRequest,
    TOTPLoginRequest,
    TOTPSetupResponse,
    TOTPVerifyRequest,
)

logger = logging.getLogger("egglogu.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Helpers (delegated to AuthService) ───────────────────────────

_slugify = AuthService.slugify
_unique_slug = AuthService.unique_slug
_client_ip = AuthService.client_ip
_user_agent = AuthService.user_agent
_build_tokens_with_session = AuthService.build_tokens_with_session
_post_login_checks = AuthService.post_login_checks


# ── Public Config ────────────────────────────────────────────────


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


# ── Registration ─────────────────────────────────────────────────


@router.post(
    "/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED
)
async def register(
    data: UserCreate, request: Request, db: AsyncSession = Depends(get_db)
):
    client_ip = _client_ip(request)
    if not await check_rate_limit(f"register:{client_ip}", 5, 3600):
        raise RateLimitError("Too many registrations. Try again in 1 hour.")

    try:
        await AuthService.validate_new_password(data.password)
    except WeakPasswordError as e:
        raise ConflictError(str(e))

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    await AuthService.register_org_and_user(
        email=data.email,
        password=data.password,
        full_name=data.full_name,
        organization_name=data.organization_name,
        db=db,
        utm_source=data.utm_source,
        utm_medium=data.utm_medium,
        utm_campaign=data.utm_campaign,
        geo_country=data.geo_country,
        geo_city=data.geo_city,
        geo_region=data.geo_region,
        geo_timezone=getattr(data, "geo_timezone", None),
        geo_lat=getattr(data, "geo_lat", None),
        geo_lng=getattr(data, "geo_lng", None),
    )

    return MessageResponse(message="Account created. Check your email to verify.")


# ── Login ────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponseExtended)
async def login(
    data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    ip = _client_ip(request)
    ua = _user_agent(request)

    # Rate limit
    if not await check_rate_limit(f"login:{ip}", 10, 900):
        raise RateLimitError("Too many login attempts. Try again in 15 minutes.")

    # Account lockout check
    if await is_account_locked(data.email):
        await log_login_attempt(db, data.email, LoginResult.locked_out, ip, ua)
        raise UnauthorizedError(
            "Account temporarily locked due to too many failed attempts. "
            "Try again in 30 minutes or reset your credentials."
        )

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        await record_failed_login(data.email)
        await log_login_attempt(db, data.email, LoginResult.bad_creds, ip, ua)
        raise UnauthorizedError("Invalid email or credentials")

    if user.hashed_password is None:
        raise UnauthorizedError(
            "Esta cuenta usa Google Sign-In. Usa el botón 'Continuar con Google'."
        )

    pwd_ok = verify_password(data.password, user.hashed_password)
    if not pwd_ok:
        count = await record_failed_login(data.email)
        await log_login_attempt(
            db, data.email, LoginResult.bad_creds, ip, ua, user_id=user.id
        )
        remaining = 5 - count
        if remaining > 0:
            raise UnauthorizedError(
                f"Invalid email or credentials. {remaining} attempts remaining."
            )
        raise UnauthorizedError(
            "Account locked due to too many failed attempts. Try again in 30 minutes."
        )

    # Upgrade old bcrypt hash to new SHA-256 prehash format
    if getattr(pwd_ok, "needs_rehash", False):
        user.hashed_password = hash_password(data.password)
        db.add(user)
        await db.flush()

    if not user.is_active:
        await log_login_attempt(
            db, data.email, LoginResult.disabled, ip, ua, user_id=user.id
        )
        raise UnauthorizedError("Account is disabled")

    if not user.email_verified:
        await log_login_attempt(
            db, data.email, LoginResult.unverified, ip, ua, user_id=user.id
        )
        raise UnauthorizedError(
            "Email not verified. Check your inbox or resend verification."
        )

    # Check if 2FA is enabled
    totp_result = await db.execute(
        select(UserTOTP).where(
            UserTOTP.user_id == user.id,
            UserTOTP.is_enabled.is_(True),
        )
    )
    totp = totp_result.scalar_one_or_none()

    if totp:
        # Issue a short-lived temp token for 2FA verification
        from jose import jwt as jose_jwt
        from src.config import settings as cfg

        temp_payload = {
            "sub": str(user.id),
            "type": "2fa_pending",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        temp_token = jose_jwt.encode(
            temp_payload, cfg.JWT_SECRET_KEY, algorithm=cfg.JWT_ALGORITHM
        )
        return TokenResponseExtended(
            access_token="",
            refresh_token="",
            requires_2fa=True,
            temp_token=temp_token,
        )

    # Clear lockout on success
    await clear_failed_logins(data.email)

    # Log successful login
    await log_login_attempt(
        db, data.email, LoginResult.success, ip, ua, user_id=user.id
    )

    # Create tokens + session
    tokens = await _build_tokens_with_session(user, request, db)

    # Post-login security checks (async, non-blocking)
    await _post_login_checks(user, request, db)

    return TokenResponseExtended(**tokens)


# ── 2FA Login Verification ───────────────────────────────────────


@router.post("/login/2fa", response_model=TokenResponseExtended)
async def login_2fa(
    data: TOTPLoginRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Complete login after 2FA challenge."""
    ip = _client_ip(request)
    ua = _user_agent(request)

    if not await check_rate_limit(f"2fa:{ip}", 10, 900):
        raise RateLimitError("Too many 2FA attempts. Try again in 15 minutes.")

    try:
        payload = decode_token(data.temp_token)
    except ValueError:
        raise UnauthorizedError("Invalid or expired 2FA token")

    if payload.get("type") != "2fa_pending":
        raise UnauthorizedError("Invalid token type")

    user_id = uuid.UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError()

    # Verify TOTP code
    totp_result = await db.execute(
        select(UserTOTP).where(
            UserTOTP.user_id == user.id, UserTOTP.is_enabled.is_(True)
        )
    )
    totp = totp_result.scalar_one_or_none()
    if not totp:
        raise UnauthorizedError("2FA is not enabled")

    from src.core.auth_security import verify_totp_code, verify_backup_code

    code = data.code.strip()

    # Try TOTP code first (6 digits)
    if len(code) == 6 and code.isdigit():
        if not verify_totp_code(totp.encrypted_seed, code):
            await log_login_attempt(
                db, user.email, LoginResult.needs_2fa, ip, ua, user_id=user.id
            )
            raise UnauthorizedError("Invalid 2FA code")
    else:
        # Try backup code (8 hex chars)
        if not totp.backup_codes_hash:
            raise UnauthorizedError("Invalid 2FA code")
        valid, updated_hashes = verify_backup_code(code, totp.backup_codes_hash)
        if not valid:
            await log_login_attempt(
                db, user.email, LoginResult.needs_2fa, ip, ua, user_id=user.id
            )
            raise UnauthorizedError("Invalid backup code")
        totp.backup_codes_hash = updated_hashes
        totp.backup_codes_used += 1

    await clear_failed_logins(user.email)
    await log_login_attempt(
        db, user.email, LoginResult.success, ip, ua, user_id=user.id
    )

    tokens = await _build_tokens_with_session(user, request, db)
    await _post_login_checks(user, request, db)

    return TokenResponseExtended(**tokens)


# ── Logout ───────────────────────────────────────────────────────


@router.post("/logout", response_model=MessageResponse)
async def logout(
    data: LogoutRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logout — blacklist current access token + revoke refresh token session."""
    # Blacklist the access token (from Authorization header)
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            access_payload = decode_token(auth_header[7:])
            access_jti = access_payload.get("jti")
            if access_jti:
                remaining = int(
                    access_payload["exp"] - datetime.now(timezone.utc).timestamp()
                )
                if remaining > 0:
                    await blacklist_token(access_jti, remaining)
        except (ValueError, KeyError):
            pass

    # Revoke refresh token session
    try:
        refresh_payload = decode_token(data.refresh_token)
        refresh_jti = refresh_payload.get("jti")
        if refresh_jti:
            remaining = int(
                refresh_payload["exp"] - datetime.now(timezone.utc).timestamp()
            )
            if remaining > 0:
                await blacklist_token(refresh_jti, remaining)
            # Mark session as revoked in DB
            from sqlalchemy import update
            from src.models.security import SessionStatus, UserSession

            await db.execute(
                update(UserSession)
                .where(UserSession.refresh_token_jti == refresh_jti)
                .values(status=SessionStatus.revoked)
            )
    except (ValueError, KeyError):
        pass

    return MessageResponse(message="Logged out successfully.")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke ALL sessions for the current user."""
    count = await blacklist_all_user_tokens(user.id, db)
    return MessageResponse(message=f"All {count} sessions revoked.")


# ── Sessions ─────────────────────────────────────────────────────


@router.get("/sessions", response_model=list[SessionRead])
async def get_sessions(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active sessions for the current user."""
    sessions = await list_user_sessions(db, user.id)

    # Determine current session from the access token JTI
    current_jti = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            payload = decode_token(auth_header[7:])
            current_jti = payload.get("jti")
        except ValueError:
            pass

    result = []
    for sess in sessions:
        sr = SessionRead.model_validate(sess)
        # Mark current session (approximate — same IP + same user-agent)
        if current_jti and sess.ip_address == _client_ip(request):
            sr.is_current = True
        result.append(sr)
    return result


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def delete_session(
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific session."""
    revoked = await revoke_session(db, session_id, user.id)
    if not revoked:
        raise NotFoundError("Session not found or already revoked")
    return MessageResponse(message="Session revoked.")


# ── 2FA Setup ────────────────────────────────────────────────────


@router.post("/2fa/setup", response_model=TOTPSetupResponse)
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate TOTP seed + QR code for 2FA setup."""
    from src.core.auth_security import (
        generate_backup_codes,
        generate_totp_seed,
        hash_backup_codes,
    )

    # Check if already enabled
    existing = await db.execute(select(UserTOTP).where(UserTOTP.user_id == user.id))
    totp = existing.scalar_one_or_none()
    if totp and totp.is_enabled:
        raise ConflictError("2FA is already enabled. Disable it first to reconfigure.")

    seed = generate_totp_seed()
    backup_codes = generate_backup_codes()

    # Build otpauth URI for QR code
    issuer = "EGGlogU"
    qr_uri = f"otpauth://totp/{issuer}:{user.email}?issuer={issuer}&algorithm=SHA1&digits=6&period=30"

    if totp:
        totp.encrypted_seed = seed
        totp.backup_codes_hash = hash_backup_codes(backup_codes)
        totp.backup_codes_used = 0
        totp.is_enabled = False  # Must verify before enabling
    else:
        totp = UserTOTP(
            user_id=user.id,
            encrypted_seed=seed,
            is_enabled=False,
            backup_codes_hash=hash_backup_codes(backup_codes),
        )
        db.add(totp)

    await db.flush()

    return TOTPSetupResponse(seed=seed, qr_uri=qr_uri, backup_codes=backup_codes)


@router.post("/2fa/verify", response_model=MessageResponse)
async def verify_2fa_setup(
    data: TOTPVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify TOTP code to enable 2FA."""
    from src.core.auth_security import verify_totp_code

    result = await db.execute(select(UserTOTP).where(UserTOTP.user_id == user.id))
    totp = result.scalar_one_or_none()
    if not totp:
        raise NotFoundError("Call /2fa/setup first")

    if totp.is_enabled:
        raise ConflictError("2FA is already enabled")

    if not verify_totp_code(totp.encrypted_seed, data.code):
        raise UnauthorizedError("Invalid code. Check your authenticator app.")

    totp.is_enabled = True
    await db.flush()
    return MessageResponse(message="2FA enabled successfully.")


@router.post("/2fa/disable", response_model=MessageResponse)
async def disable_2fa(
    data: TOTPDisableRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable 2FA (requires valid TOTP code)."""
    from src.core.auth_security import verify_totp_code

    result = await db.execute(
        select(UserTOTP).where(
            UserTOTP.user_id == user.id, UserTOTP.is_enabled.is_(True)
        )
    )
    totp = result.scalar_one_or_none()
    if not totp:
        raise NotFoundError("2FA is not enabled")

    if not verify_totp_code(totp.encrypted_seed, data.code):
        raise UnauthorizedError("Invalid code")

    totp.is_enabled = False
    await db.flush()
    return MessageResponse(message="2FA disabled.")


# ── OAuth State (PKCE) ──────────────────────────────────────────


@router.get("/oauth/state/{provider}", response_model=OAuthStateResponse)
async def get_oauth_state(provider: str):
    """Generate OAuth state + PKCE challenge for a provider."""
    if provider not in ("google", "apple", "microsoft"):
        raise NotFoundError("Unknown provider")
    state_data = await create_oauth_state(provider)
    return OAuthStateResponse(
        state=state_data["state"],
        code_challenge=state_data["code_challenge"],
    )


# ── Google OAuth ─────────────────────────────────────────────────


@router.post("/google", response_model=TokenResponseExtended)
async def google_auth(
    data: GoogleAuthRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token as google_id_token

    from src.config import settings

    if not settings.GOOGLE_CLIENT_ID:
        raise UnauthorizedError("Google Sign-In is not configured")

    ip = _client_ip(request)
    ua = _user_agent(request)
    if not await check_rate_limit(f"google:{ip}", 10, 900):
        raise RateLimitError("Too many attempts. Try again in 15 minutes.")

    email = None
    name = ""
    sub = None

    if data.access_token:
        # Popup flow: verify access_token via Google userinfo API
        import httpx as _httpx

        try:
            async with _httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {data.access_token}"},
                )
                if resp.status_code != 200:
                    raise ValueError("Invalid access token")
                payload = resp.json()
                email = payload.get("email")
                name = payload.get("name", "")
                sub = payload.get("sub")
        except Exception:
            await log_login_attempt(
                db, "unknown", LoginResult.bad_creds, ip, ua, method="google"
            )
            raise UnauthorizedError("Invalid Google token")
    elif data.credential:
        # One Tap flow: verify ID token JWT
        try:
            payload = google_id_token.verify_oauth2_token(
                data.credential, GoogleRequest(), settings.GOOGLE_CLIENT_ID
            )
            email = payload.get("email")
            name = payload.get("name", "")
            sub = payload.get("sub")
        except ValueError:
            await log_login_attempt(
                db, "unknown", LoginResult.bad_creds, ip, ua, method="google"
            )
            raise UnauthorizedError("Invalid Google token")
    else:
        raise UnauthorizedError("No credential or access_token provided")
    if not email or not sub:
        raise UnauthorizedError("Invalid Google token payload")

    user = await AuthService.oauth_find_or_create(
        email=email,
        name=name,
        oauth_sub=sub,
        provider="google",
        organization_name=data.organization_name,
        db=db,
    )
    if not user.is_active:
        await log_login_attempt(
            db,
            email,
            LoginResult.disabled,
            ip,
            ua,
            user_id=user.id,
            method="google",
        )
        raise UnauthorizedError("Account is disabled")

    await log_login_attempt(
        db, email, LoginResult.success, ip, ua, user_id=user.id, method="google"
    )
    tokens = await _build_tokens_with_session(user, request, db)
    await _post_login_checks(user, request, db)

    return TokenResponseExtended(**tokens)


# ── Apple OAuth ──────────────────────────────────────────────────


@router.post("/apple", response_model=TokenResponseExtended)
async def apple_auth(
    data: AppleAuthRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    import jwt
    from src.config import settings

    if not settings.APPLE_CLIENT_ID:
        raise UnauthorizedError("Apple Sign-In is not configured")

    ip = _client_ip(request)
    ua = _user_agent(request)
    if not await check_rate_limit(f"apple:{ip}", 10, 900):
        raise RateLimitError("Too many attempts. Try again in 15 minutes.")

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
        await log_login_attempt(
            db, "unknown", LoginResult.bad_creds, ip, ua, method="apple"
        )
        raise UnauthorizedError("Invalid Apple token")

    email = payload.get("email")
    sub = payload.get("sub")
    if not email or not sub:
        raise UnauthorizedError("Invalid Apple token payload")

    name = data.full_name or email.split("@")[0]

    user = await AuthService.oauth_find_or_create(
        email=email,
        name=name,
        oauth_sub=sub,
        provider="apple",
        organization_name=data.organization_name,
        db=db,
    )
    if not user.is_active:
        await log_login_attempt(
            db,
            email,
            LoginResult.disabled,
            ip,
            ua,
            user_id=user.id,
            method="apple",
        )
        raise UnauthorizedError("Account is disabled")

    await log_login_attempt(
        db, email, LoginResult.success, ip, ua, user_id=user.id, method="apple"
    )
    tokens = await _build_tokens_with_session(user, request, db)
    await _post_login_checks(user, request, db)

    return TokenResponseExtended(**tokens)


# ── Microsoft OAuth ──────────────────────────────────────────────


@router.post("/microsoft", response_model=TokenResponseExtended)
async def microsoft_auth(
    data: MicrosoftAuthRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    from src.config import settings

    if not settings.MICROSOFT_CLIENT_ID:
        raise UnauthorizedError("Microsoft Sign-In is not configured")

    ip = _client_ip(request)
    ua = _user_agent(request)
    if not await check_rate_limit(f"microsoft:{ip}", 10, 900):
        raise RateLimitError("Too many attempts. Try again in 15 minutes.")

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
        await log_login_attempt(
            db, "unknown", LoginResult.bad_creds, ip, ua, method="microsoft"
        )
        raise UnauthorizedError("Failed to verify Microsoft token")

    email = profile.get("mail") or profile.get("userPrincipalName")
    name = profile.get("displayName", "")
    sub = profile.get("id")
    if not email or not sub:
        raise UnauthorizedError("Invalid Microsoft profile — missing email")

    user = await AuthService.oauth_find_or_create(
        email=email,
        name=name,
        oauth_sub=sub,
        provider="microsoft",
        organization_name=data.organization_name,
        db=db,
    )
    if not user.is_active:
        await log_login_attempt(
            db,
            email,
            LoginResult.disabled,
            ip,
            ua,
            user_id=user.id,
            method="microsoft",
        )
        raise UnauthorizedError("Account is disabled")

    await log_login_attempt(
        db, email, LoginResult.success, ip, ua, user_id=user.id, method="microsoft"
    )
    tokens = await _build_tokens_with_session(user, request, db)
    await _post_login_checks(user, request, db)

    return TokenResponseExtended(**tokens)


# ── Token Refresh (with rotation) ───────────────────────────────


@router.post("/refresh", response_model=TokenResponseExtended)
async def refresh(
    data: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    ip = _client_ip(request)
    if not await check_rate_limit(f"refresh:{ip}", 30, 900):
        raise RateLimitError("Too many refresh attempts. Try again later.")

    try:
        payload = decode_token(data.refresh_token)
    except ValueError:
        raise UnauthorizedError("Invalid refresh token")
    if payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid token type")

    old_jti = payload.get("jti")

    # Check if token is blacklisted
    if old_jti and await is_token_blacklisted(old_jti):
        raise UnauthorizedError("Token has been revoked")

    user_id = uuid.UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise UnauthorizedError()

    # Rotate refresh token
    new_refresh, new_jti = create_refresh_token(user.id)
    new_access = create_access_token(user.id, user.organization_id, user.role.value, email=user.email)

    if old_jti:
        rotated = await rotate_refresh_session(
            db, old_jti, new_jti, user.id, ip, _user_agent(request)
        )
        if rotated is None:
            # Token reuse detected — all sessions revoked
            raise UnauthorizedError(
                "Session compromised. All sessions revoked. Please log in again."
            )
    else:
        # Legacy token without JTI — create a new session
        await create_session(
            db=db,
            user_id=user.id,
            jti=new_jti,
            ip_address=ip,
            user_agent=_user_agent(request),
        )

    return TokenResponseExtended(
        access_token=new_access,
        refresh_token=new_refresh,
    )


# ── Profile ──────────────────────────────────────────────────────


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserRead)
async def update_me(
    data: UserUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await check_rate_limit(f"update_profile:{user.id}", 30, 3600):
        raise RateLimitError("Too many profile updates. Try again later.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.flush()
    await db.refresh(user)
    return user


# ── Forgot / Reset / Change ─────────────────────────────────────


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    data: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    ip = _client_ip(request)
    if not await check_rate_limit(f"forgot:{ip}", 3, 3600):
        raise RateLimitError("Too many reset requests. Try again in 1 hour.")

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
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

    # HIBP breach check
    breach_count = await check_pwned(data.new_password)
    if breach_count > 0:
        raise ConflictError(
            f"This credential has appeared in {breach_count} data breaches. "
            "Please choose a different one."
        )

    user.hashed_password = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.flush()
    return MessageResponse(message="Credentials reset successfully.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.hashed_password:
        raise ConflictError(
            "Account uses social login. Set credentials via forgot-password first."
        )
    if not verify_password(data.current_password, user.hashed_password):
        raise UnauthorizedError("Current credentials are incorrect")
    try:
        validate_password(data.new_password)
    except WeakPasswordError as e:
        raise ConflictError(str(e))

    # HIBP breach check
    breach_count = await check_pwned(data.new_password)
    if breach_count > 0:
        raise ConflictError(
            f"This credential has appeared in {breach_count} data breaches. "
            "Please choose a different one."
        )

    user.hashed_password = hash_password(data.new_password)
    await db.flush()
    return MessageResponse(message="Credentials changed successfully.")


# ── Email Verification ───────────────────────────────────────────


@router.post("/verify-email", response_model=TokenResponseExtended)
async def verify_email(
    data: VerifyEmailRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    ip = _client_ip(request)
    if not await check_rate_limit(f"verify:{ip}", 10, 900):
        raise RateLimitError("Too many verification attempts. Try again later.")

    result = await db.execute(select(User).where(User.verification_token == data.token))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("Invalid verification token")

    if not user.email_verified:
        user.email_verified = True
        user.verification_token = None
        await db.flush()

    tokens = await _build_tokens_with_session(user, request, db)
    return TokenResponseExtended(**tokens)


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    data: ResendVerificationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not await check_rate_limit(f"resend:{data.email}", 1, 120):
        raise RateLimitError("Verification email already sent. Wait 2 minutes.")

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user and not user.email_verified:
        token = generate_token()
        user.verification_token = token
        await db.flush()
        await send_verification_email(data.email, token)
    return MessageResponse(
        message="If the email exists and is not verified, a new link has been sent."
    )


# ── Team Invites ─────────────────────────────────────────────────


@router.post("/send-team-invite", response_model=MessageResponse)
async def send_team_invite_endpoint(data: TeamInviteRequest, request: Request):
    ip = _client_ip(request)
    if not await check_rate_limit(f"team_invite:{ip}", 10, 3600):
        raise RateLimitError("Too many invitations. Try again in 1 hour.")

    await send_team_invite(
        email=data.email,
        member_name=data.member_name,
        role=data.role,
        org_name=data.organization_name,
        invited_by=data.invited_by,
    )
    return MessageResponse(message="Team invitation email sent.")


# ── Account Reassignment ────────────────────────────────────────


@router.post("/notify-reassignment", response_model=MessageResponse)
async def notify_reassignment(data: ReassignmentNotifyRequest, request: Request):
    ip = _client_ip(request)
    if not await check_rate_limit(f"reassign_notify:{ip}", 5, 3600):
        raise RateLimitError("Too many reassignment notifications. Try again later.")

    await send_reassignment_notification(
        new_email=data.new_email,
        new_name=data.new_name,
        old_name=data.old_name,
        role=data.role,
        org_name=data.organization_name,
        reassigned_by=data.reassigned_by,
    )
    return MessageResponse(message="Reassignment notification sent.")


# ── Login History ────────────────────────────────────────────────


@router.get("/login-history")
async def login_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the last 20 login attempts for the current user."""
    from src.models.security import LoginAuditLog
    from src.schemas.security import LoginAuditRead

    result = await db.execute(
        select(LoginAuditLog)
        .where(LoginAuditLog.user_id == user.id)
        .order_by(LoginAuditLog.created_at.desc())
        .limit(20)
    )
    entries = result.scalars().all()
    return [LoginAuditRead.model_validate(e) for e in entries]


# ── Load Test Registration (gated behind LOADTEST_SECRET) ───────

LOADTEST_SECRET = os.environ.get("LOADTEST_SECRET")


@router.post("/loadtest-register", response_model=TokenResponseExtended)
async def loadtest_register(
    data: UserCreate, request: Request, db: AsyncSession = Depends(get_db)
):
    """Auto-verified registration for load testing. Only available when
    LOADTEST_SECRET env var is set and the request includes matching header."""
    if not LOADTEST_SECRET:
        raise NotFoundError("Not found")

    req_secret = request.headers.get("X-Loadtest-Secret", "")
    if req_secret != LOADTEST_SECRET:
        raise UnauthorizedError("Invalid loadtest secret")

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise ConflictError("Email already registered")

    org = Organization(
        name=data.organization_name, slug=_slugify(data.organization_name)
    )
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

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=Role.owner,
        organization_id=org.id,
        email_verified=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    tokens = await _build_tokens_with_session(user, request, db)
    return TokenResponseExtended(**tokens)
