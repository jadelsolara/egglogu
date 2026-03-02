"""Schemas for security endpoints — sessions, 2FA, logout."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Logout ───────────────────────────────────────────────────────


class LogoutRequest(BaseModel):
    refresh_token: str


class LogoutAllRequest(BaseModel):
    """Revoke all sessions for the current user."""

    pass


# ── Sessions ─────────────────────────────────────────────────────


class SessionRead(BaseModel):
    id: uuid.UUID
    ip_address: str
    device_name: Optional[str] = None
    geo_country: Optional[str] = None
    geo_city: Optional[str] = None
    last_activity: datetime
    created_at: datetime
    is_current: bool = False

    model_config = {"from_attributes": True}


class RevokeSessionRequest(BaseModel):
    session_id: uuid.UUID


# ── 2FA / TOTP ───────────────────────────────────────────────────


class TOTPSetupResponse(BaseModel):
    seed: str
    qr_uri: str
    backup_codes: list[str]


class TOTPVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


class TOTPLoginRequest(BaseModel):
    """Used when login returns requires_2fa=true."""

    temp_token: str
    code: str = Field(..., min_length=6, max_length=8)


class TOTPDisableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")


# ── Extended Token Response ──────────────────────────────────────


class TokenResponseExtended(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    requires_2fa: bool = False
    temp_token: Optional[str] = None


# ── Login Audit ──────────────────────────────────────────────────


class LoginAuditRead(BaseModel):
    id: uuid.UUID
    email: str
    result: str
    ip_address: str
    user_agent: Optional[str] = None
    geo_country: Optional[str] = None
    geo_city: Optional[str] = None
    method: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── OAuth State ──────────────────────────────────────────────────


class OAuthStateResponse(BaseModel):
    state: str
    code_challenge: str
    code_challenge_method: str = "S256"
