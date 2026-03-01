import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from src.config import settings


class WeakPasswordError(ValueError):
    """Raised when a password doesn't meet strength requirements."""


def validate_password(password: str) -> None:
    """Enforce password strength: min 8 chars, 1 upper, 1 lower, 1 digit.

    Raises WeakPasswordError with a descriptive message on failure.
    """
    if len(password) < 8:
        raise WeakPasswordError("Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", password):
        raise WeakPasswordError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise WeakPasswordError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise WeakPasswordError("Password must contain at least one digit")


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(
    user_id: uuid.UUID, org_id: uuid.UUID | None, role: str, jti: str | None = None
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_id),
        "org": str(org_id) if org_id else None,
        "role": role,
        "exp": expire,
        "type": "access",
        "jti": jti or secrets.token_urlsafe(16),
    }
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


def create_refresh_token(user_id: uuid.UUID, jti: str | None = None) -> tuple[str, str]:
    """Create refresh token. Returns (token, jti) tuple."""
    token_jti = jti or secrets.token_urlsafe(16)
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
        "jti": token_jti,
    }
    token = jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return token, token_jti


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")
