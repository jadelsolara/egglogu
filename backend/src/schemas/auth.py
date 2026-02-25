import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)
    organization_name: str = Field(..., min_length=1, max_length=200)
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    geo_country: Optional[str] = None
    geo_city: Optional[str] = None
    geo_region: Optional[str] = None
    geo_timezone: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    organization_id: Optional[uuid.UUID] = None
    is_active: bool
    email_verified: bool
    created_at: datetime
    geo_country: Optional[str] = None
    geo_city: Optional[str] = None
    geo_region: Optional[str] = None
    geo_timezone: Optional[str] = None
    geo_lat: Optional[float] = None
    geo_lng: Optional[float] = None

    model_config = {"from_attributes": True}


class GoogleAuthRequest(BaseModel):
    credential: str
    organization_name: str = ""


class AppleAuthRequest(BaseModel):
    id_token: str
    authorization_code: str = ""
    full_name: str = ""
    organization_name: str = ""


class MicrosoftAuthRequest(BaseModel):
    access_token: str
    organization_name: str = ""


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class TeamInviteRequest(BaseModel):
    email: EmailStr
    member_name: str = Field(..., min_length=1, max_length=200)
    role: str = Field(..., min_length=1, max_length=50, pattern=r"^(owner|manager|vet|viewer)$")
    organization_name: str = Field(..., min_length=1, max_length=200)
    invited_by: str = Field(..., min_length=1, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class MessageResponse(BaseModel):
    message: str
