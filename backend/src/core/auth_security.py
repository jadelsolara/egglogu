"""Auth security logic — token blacklist, lockout, audit, sessions,
2FA, breach checking, impossible travel, new-device alerts."""

import hashlib
import logging
import math
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.security import (
    KnownDevice,
    LoginAuditLog,
    LoginResult,
    SessionStatus,
    UserSession,
)

logger = logging.getLogger("egglogu.auth_security")

# ── Redis key prefixes ───────────────────────────────────────────
_PREFIX_BLACKLIST = "bl:"  # token blacklist
_PREFIX_LOCKOUT = "lockout:"  # failed attempt counter
_PREFIX_OAUTH_STATE = "oauth:"  # PKCE / state validation
_PREFIX_TOTP_RATE = "totp_rl:"  # 2FA rate limiting


async def _get_redis():
    """Get the shared Redis connection from rate_limit module."""
    from src.core.rate_limit import _redis

    return _redis


# ═══════════════════════════════════════════════════════════════════
# 1) TOKEN BLACKLIST (Redis-backed)
# ═══════════════════════════════════════════════════════════════════


async def blacklist_token(jti: str, expires_in_seconds: int) -> None:
    """Add a token JTI to the blacklist. TTL matches token expiry."""
    redis = await _get_redis()
    if not redis:
        logger.critical(
            "Token blacklist UNAVAILABLE — Redis down, revoked tokens may pass"
        )
        return
    try:
        await redis.setex(f"{_PREFIX_BLACKLIST}{jti}", expires_in_seconds, "1")
    except Exception as e:
        logger.critical("Failed to blacklist token: %s", e)


async def is_token_blacklisted(jti: str) -> bool:
    """Check if a token JTI is blacklisted. Fail-closed in production, fail-open in dev."""
    redis = await _get_redis()
    if not redis:
        if "sqlite" in settings.DATABASE_URL:
            return False
        logger.error("Redis unavailable for token blacklist check — fail-closed")
        return True
    try:
        return await redis.exists(f"{_PREFIX_BLACKLIST}{jti}") > 0
    except Exception as e:
        logger.error("Redis error checking token blacklist: %s — fail-closed", e)
        return True


async def blacklist_all_user_tokens(user_id: uuid.UUID, db: AsyncSession) -> int:
    """Revoke ALL active sessions for a user. Returns count revoked."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.status == SessionStatus.active,
        )
    )
    sessions = result.scalars().all()
    count = 0
    now = datetime.now(timezone.utc)
    for sess in sessions:
        remaining = int(
            (sess.expires_at.replace(tzinfo=timezone.utc) - now).total_seconds()
        )
        if remaining > 0:
            await blacklist_token(sess.refresh_token_jti, remaining)
        sess.status = SessionStatus.revoked
        count += 1
    if count:
        await db.flush()
    return count


# ═══════════════════════════════════════════════════════════════════
# 2) ACCOUNT LOCKOUT (Redis counters)
# ═══════════════════════════════════════════════════════════════════

LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 1800  # 30 minutes


async def record_failed_login(email: str) -> int:
    """Increment failed login counter. Fail-closed in production, fail-open in dev."""
    redis = await _get_redis()
    if not redis:
        if "sqlite" in settings.DATABASE_URL:
            return 0
        logger.error(
            "Redis unavailable for login lockout — fail-closed, returning max attempts"
        )
        return LOCKOUT_MAX_ATTEMPTS
    try:
        key = f"{_PREFIX_LOCKOUT}{email}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, LOCKOUT_WINDOW_SECONDS)
        return count
    except Exception as e:
        logger.error("Redis error recording failed login: %s — fail-closed", e)
        return LOCKOUT_MAX_ATTEMPTS


async def clear_failed_logins(email: str) -> None:
    """Reset counter on successful login."""
    redis = await _get_redis()
    if not redis:
        return
    try:
        await redis.delete(f"{_PREFIX_LOCKOUT}{email}")
    except Exception:
        pass


async def is_account_locked(email: str) -> bool:
    """Check if account is locked. Fail-closed in production, fail-open in dev."""
    redis = await _get_redis()
    if not redis:
        if "sqlite" in settings.DATABASE_URL:
            logger.warning("Redis unavailable for lockout check — dev mode, fail-open")
            return False
        logger.error("Redis unavailable for account lockout check — fail-closed")
        return True
    try:
        count = await redis.get(f"{_PREFIX_LOCKOUT}{email}")
        return count is not None and int(count) >= LOCKOUT_MAX_ATTEMPTS
    except Exception as e:
        logger.error("Redis error checking account lockout: %s — fail-closed", e)
        return True


async def get_lockout_remaining(email: str) -> int:
    """Get remaining lockout seconds. Fail-closed: Redis down = return full window."""
    redis = await _get_redis()
    if not redis:
        logger.error(
            "Redis unavailable for lockout TTL — fail-closed, returning full window"
        )
        return LOCKOUT_WINDOW_SECONDS
    try:
        ttl = await redis.ttl(f"{_PREFIX_LOCKOUT}{email}")
        return max(0, ttl)
    except Exception as e:
        logger.error("Redis error getting lockout TTL: %s — fail-closed", e)
        return LOCKOUT_WINDOW_SECONDS


# ═══════════════════════════════════════════════════════════════════
# 3) OAUTH STATE / PKCE
# ═══════════════════════════════════════════════════════════════════

OAUTH_STATE_TTL = 600  # 10 minutes


async def create_oauth_state(provider: str) -> dict:
    """Generate state + code_verifier for OAuth PKCE flow."""
    state = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    # S256 challenge
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    import base64

    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    redis = await _get_redis()
    if redis:
        try:
            await redis.setex(
                f"{_PREFIX_OAUTH_STATE}{state}",
                OAUTH_STATE_TTL,
                code_verifier,
            )
        except Exception as e:
            logger.error("Failed to store OAuth state: %s", e)

    return {
        "state": state,
        "code_verifier": code_verifier,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }


async def validate_oauth_state(state: str) -> Optional[str]:
    """Validate and consume state. Returns code_verifier or None."""
    redis = await _get_redis()
    if not redis:
        return None
    try:
        key = f"{_PREFIX_OAUTH_STATE}{state}"
        verifier = await redis.get(key)
        if verifier:
            await redis.delete(key)  # consume — one-time use
        return verifier
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════
# 4) LOGIN AUDIT LOGGING
# ═══════════════════════════════════════════════════════════════════


async def log_login_attempt(
    db: AsyncSession,
    email: str,
    result: LoginResult,
    ip_address: str,
    user_agent: Optional[str] = None,
    user_id: Optional[uuid.UUID] = None,
    method: str = "credentials",
    geo_country: Optional[str] = None,
    geo_city: Optional[str] = None,
    geo_lat: Optional[float] = None,
    geo_lng: Optional[float] = None,
) -> LoginAuditLog:
    """Record a login attempt in the audit log."""
    entry = LoginAuditLog(
        user_id=user_id,
        email=email,
        result=result,
        ip_address=ip_address,
        user_agent=user_agent[:2000] if user_agent else None,
        method=method,
        geo_country=geo_country,
        geo_city=geo_city,
        geo_lat=geo_lat,
        geo_lng=geo_lng,
    )
    db.add(entry)
    await db.flush()
    return entry


# ═══════════════════════════════════════════════════════════════════
# 5) SESSION MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


async def create_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    jti: str,
    ip_address: str,
    user_agent: Optional[str] = None,
    expires_at: Optional[datetime] = None,
    geo_country: Optional[str] = None,
    geo_city: Optional[str] = None,
) -> UserSession:
    """Create a new session record when issuing a refresh token."""
    if expires_at is None:
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
        )
    # Parse user-agent into a friendly device name
    device_name = _parse_device_name(user_agent)

    session = UserSession(
        user_id=user_id,
        refresh_token_jti=jti,
        ip_address=ip_address,
        user_agent=user_agent[:2000] if user_agent else None,
        device_name=device_name,
        geo_country=geo_country,
        geo_city=geo_city,
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()
    return session


async def revoke_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    """Revoke a specific session. Returns True if found and revoked."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.status == SessionStatus.active,
        )
    )
    sess = result.scalar_one_or_none()
    if not sess:
        return False

    sess.status = SessionStatus.revoked
    now = datetime.now(timezone.utc)
    remaining = int(
        (sess.expires_at.replace(tzinfo=timezone.utc) - now).total_seconds()
    )
    if remaining > 0:
        await blacklist_token(sess.refresh_token_jti, remaining)
    await db.flush()
    return True


async def list_user_sessions(db: AsyncSession, user_id: uuid.UUID) -> list[UserSession]:
    """List all active sessions for a user."""
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == user_id,
            UserSession.status == SessionStatus.active,
            UserSession.expires_at > datetime.now(timezone.utc),
        )
        .order_by(UserSession.last_activity.desc())
    )
    return list(result.scalars().all())


async def update_session_activity(db: AsyncSession, jti: str) -> None:
    """Update last_activity timestamp for a session on token refresh."""
    await db.execute(
        update(UserSession)
        .where(UserSession.refresh_token_jti == jti)
        .values(last_activity=datetime.now(timezone.utc))
    )


# ═══════════════════════════════════════════════════════════════════
# 6) REFRESH TOKEN ROTATION
# ═══════════════════════════════════════════════════════════════════


async def rotate_refresh_session(
    db: AsyncSession,
    old_jti: str,
    new_jti: str,
    user_id: uuid.UUID,
    ip_address: str,
    user_agent: Optional[str] = None,
) -> Optional[UserSession]:
    """Rotate: invalidate old refresh token, create new session.

    If old JTI is already revoked → possible token theft → revoke ALL.
    """
    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token_jti == old_jti)
    )
    old_session = result.scalar_one_or_none()

    if old_session and old_session.status == SessionStatus.revoked:
        # TOKEN REUSE DETECTED — revoke everything
        logger.warning(
            "Refresh token reuse detected for user %s (jti=%s). Revoking all sessions.",
            user_id,
            old_jti,
        )
        await blacklist_all_user_tokens(user_id, db)
        return None

    # Invalidate old session
    if old_session:
        old_session.status = SessionStatus.revoked
        now = datetime.now(timezone.utc)
        remaining = int(
            (old_session.expires_at.replace(tzinfo=timezone.utc) - now).total_seconds()
        )
        if remaining > 0:
            await blacklist_token(old_jti, remaining)

    # Create new session
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    new_session = UserSession(
        user_id=user_id,
        refresh_token_jti=new_jti,
        ip_address=ip_address,
        user_agent=user_agent[:2000] if user_agent else None,
        device_name=_parse_device_name(user_agent),
        expires_at=expires_at,
    )
    db.add(new_session)
    await db.flush()
    return new_session


# ═══════════════════════════════════════════════════════════════════
# 7) IMPOSSIBLE TRAVEL DETECTION
# ═══════════════════════════════════════════════════════════════════

MAX_TRAVEL_SPEED_KMH = 900  # ~commercial jet speed


async def check_impossible_travel(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_lat: Optional[float],
    current_lng: Optional[float],
) -> dict:
    """Check if login location is physically impossible given last login.

    Returns {impossible: bool, details: str}
    """
    if current_lat is None or current_lng is None:
        return {"impossible": False, "details": "no_geo"}

    # Get the most recent successful login with geo data
    result = await db.execute(
        select(LoginAuditLog)
        .where(
            LoginAuditLog.user_id == user_id,
            LoginAuditLog.result == LoginResult.success,
            LoginAuditLog.geo_lat.isnot(None),
            LoginAuditLog.geo_lng.isnot(None),
        )
        .order_by(LoginAuditLog.created_at.desc())
        .limit(1)
    )
    last_login = result.scalar_one_or_none()

    if not last_login:
        return {"impossible": False, "details": "first_login"}

    # Calculate distance (Haversine formula)
    dist_km = _haversine(
        last_login.geo_lat, last_login.geo_lng, current_lat, current_lng
    )

    # Calculate time difference
    now = datetime.now(timezone.utc)
    last_time = last_login.created_at
    if last_time.tzinfo is None:
        last_time = last_time.replace(tzinfo=timezone.utc)
    hours_elapsed = max((now - last_time).total_seconds() / 3600, 0.01)

    speed_kmh = dist_km / hours_elapsed

    if speed_kmh > MAX_TRAVEL_SPEED_KMH and dist_km > 100:
        return {
            "impossible": True,
            "details": (
                f"distance={dist_km:.0f}km, "
                f"time={hours_elapsed:.1f}h, "
                f"speed={speed_kmh:.0f}km/h, "
                f"from={last_login.geo_city or 'unknown'}"
            ),
        }

    return {"impossible": False, "details": "ok"}


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two lat/lng points."""
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ═══════════════════════════════════════════════════════════════════
# 8) HIBP BREACH CHECKING (k-anonymity)
# ═══════════════════════════════════════════════════════════════════


async def check_pwned(plain: str) -> int:
    """Check if a value appears in HaveIBeenPwned breaches.

    Uses k-anonymity: only sends first 5 chars of SHA-1 hash.
    Returns the breach count (0 = safe).
    """
    sha1 = hashlib.sha1(plain.encode("utf-8")).hexdigest().upper()
    prefix = sha1[:5]
    suffix = sha1[5:]

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"https://api.pwnedpasswords.com/range/{prefix}",
                headers={"Add-Padding": "true"},
            )
            if resp.status_code != 200:
                return 0  # fail-open on API errors
            for line in resp.text.splitlines():
                parts = line.strip().split(":")
                if len(parts) == 2 and parts[0] == suffix:
                    return int(parts[1])
    except Exception as e:
        logger.warning("HIBP check failed: %s", e)
    return 0


# ═══════════════════════════════════════════════════════════════════
# 9) KNOWN DEVICE TRACKING + NEW LOGIN ALERTS
# ═══════════════════════════════════════════════════════════════════


def _compute_device_fingerprint(ip: str, user_agent: str) -> str:
    """Create a stable fingerprint from IP subnet + UA."""
    # Use /24 subnet for IPv4 (allows minor IP changes)
    ip_parts = ip.split(".")
    if len(ip_parts) == 4:
        subnet = ".".join(ip_parts[:3])
    else:
        subnet = ip  # IPv6 — use full
    raw = f"{subnet}|{user_agent or 'unknown'}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def check_known_device(
    db: AsyncSession,
    user_id: uuid.UUID,
    ip: str,
    user_agent: Optional[str],
) -> tuple[bool, Optional[KnownDevice]]:
    """Check if device is known. Returns (is_known, device_record).

    If unknown, creates a new KnownDevice record.
    """
    fingerprint = _compute_device_fingerprint(ip, user_agent or "")

    result = await db.execute(
        select(KnownDevice).where(
            KnownDevice.user_id == user_id,
            KnownDevice.device_fingerprint == fingerprint,
        )
    )
    device = result.scalar_one_or_none()

    if device:
        device.last_seen = datetime.now(timezone.utc)
        device.ip_address = ip
        await db.flush()
        return True, device

    # New device — register it
    new_device = KnownDevice(
        user_id=user_id,
        device_fingerprint=fingerprint,
        ip_address=ip,
        user_agent=user_agent[:2000] if user_agent else None,
        device_name=_parse_device_name(user_agent),
    )
    db.add(new_device)
    await db.flush()
    return False, new_device


async def send_new_login_alert(
    email: str, name: str, ip: str, device_name: str
) -> None:
    """Send email notification about login from a new device."""
    from src.core.email import _send_email

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#dc2626">New Login Detected — EGGlogU</h2>
      <p>Hi {name},</p>
      <p>We detected a login to your EGGlogU account from a new device:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Device</td>
            <td style="padding:8px;border:1px solid #ddd">{device_name or "Unknown"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">IP</td>
            <td style="padding:8px;border:1px solid #ddd">{ip}</td></tr>
        <tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Time</td>
            <td style="padding:8px;border:1px solid #ddd">{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}</td></tr>
      </table>
      <p>If this was you, no action is needed.</p>
      <p style="color:#dc2626"><strong>If this wasn't you</strong>, change your credentials immediately and enable 2FA.</p>
    </div>
    """
    await _send_email(
        email, "New login to your EGGlogU account", html, tipo="alerta_login"
    )


# ═══════════════════════════════════════════════════════════════════
# 10) 2FA / TOTP
# ═══════════════════════════════════════════════════════════════════


def generate_totp_seed() -> str:
    """Generate a random base32 seed for TOTP."""
    import base64

    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def verify_totp_code(seed: str, code: str, window: int = 1) -> bool:
    """Verify a TOTP code against the seed with a time window.

    Uses HMAC-SHA1, 6-digit codes, 30-second intervals.
    Window=1 means we accept codes from [-30s, +30s].
    """
    import hmac
    import struct
    import time as _time

    if len(code) != 6 or not code.isdigit():
        return False

    import base64

    try:
        key = base64.b32decode(seed, casefold=True)
    except Exception:
        return False

    now = int(_time.time())
    for offset in range(-window, window + 1):
        counter = (now // 30) + offset
        msg = struct.pack(">Q", counter)
        h = hmac.new(key, msg, "sha1").digest()
        o = h[-1] & 0x0F
        truncated = struct.unpack(">I", h[o : o + 4])[0] & 0x7FFFFFFF
        generated = str(truncated % 1000000).zfill(6)
        if hmac.compare_digest(generated, code):
            return True
    return False


def generate_backup_codes(count: int = 8) -> list[str]:
    """Generate a set of one-time backup codes."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


def hash_backup_codes(codes: list[str]) -> str:
    """Hash backup codes for storage (pipe-separated bcrypt hashes)."""
    import bcrypt

    hashes = []
    for code in codes:
        h = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
        hashes.append(h)
    return "|".join(hashes)


def verify_backup_code(code: str, stored_hashes: str) -> tuple[bool, str]:
    """Verify a backup code and return (valid, updated_hashes_without_used_code)."""
    import bcrypt

    hashes = stored_hashes.split("|")
    for i, h in enumerate(hashes):
        if bcrypt.checkpw(code.encode(), h.encode()):
            remaining = hashes[:i] + hashes[i + 1 :]
            return True, "|".join(remaining)
    return False, stored_hashes


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════


def _parse_device_name(user_agent: Optional[str]) -> Optional[str]:
    """Extract a human-readable device name from User-Agent string."""
    if not user_agent:
        return None
    ua = user_agent.lower()
    # OS detection
    if "iphone" in ua:
        os_name = "iPhone"
    elif "ipad" in ua:
        os_name = "iPad"
    elif "android" in ua:
        os_name = "Android"
    elif "windows" in ua:
        os_name = "Windows"
    elif "macintosh" in ua or "mac os" in ua:
        os_name = "Mac"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Unknown OS"
    # Browser detection
    if "chrome" in ua and "edg" not in ua:
        browser = "Chrome"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "edg" in ua:
        browser = "Edge"
    else:
        browser = "Browser"
    return f"{os_name} — {browser}"
