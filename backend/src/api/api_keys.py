"""API Key management endpoints — create, list, revoke keys for external access."""

import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_current_user
from src.models.api_key import APIKey

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

KEY_PREFIX_LENGTH = 8  # Visible prefix for identification


# ─── Schemas ─────────────────────────────────────────────────────────

class APIKeyCreate(BaseModel):
    name: str
    scopes: list[str] = []
    description: str | None = None
    expires_in_days: int | None = None  # None = no expiration

class APIKeyResponse(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    expires_at: datetime | None
    last_used_at: datetime | None
    total_requests: int
    description: str | None
    created_at: datetime

class APIKeyCreatedResponse(APIKeyResponse):
    """Returned only on creation — includes the full key (shown once)."""
    full_key: str


# ─── Endpoints ───────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_api_key(
    body: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new API key. The full key is returned ONCE — store it securely."""
    # Generate key: egglogu_<prefix>_<random>
    raw_key = f"egglogu_{secrets.token_hex(4)}_{secrets.token_hex(24)}"
    prefix = raw_key[:KEY_PREFIX_LENGTH]
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    expires_at = None
    if body.expires_in_days:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    api_key = APIKey(
        name=body.name,
        key_prefix=prefix,
        key_hash=key_hash,
        scopes=body.scopes,
        description=body.description,
        expires_at=expires_at,
        organization_id=user.organization_id,
        created_by=user.id,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return APIKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        expires_at=api_key.expires_at,
        last_used_at=api_key.last_used_at,
        total_requests=api_key.total_requests,
        description=api_key.description,
        created_at=api_key.created_at,
        full_key=raw_key,
    ).model_dump()


@router.get("")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """List all API keys for the organization (keys are masked)."""
    offset = (page - 1) * size
    result = await db.execute(
        select(APIKey)
        .where(APIKey.organization_id == user.organization_id)
        .order_by(APIKey.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    keys = result.scalars().all()

    count_result = await db.execute(
        select(func.count(APIKey.id)).where(APIKey.organization_id == user.organization_id)
    )
    total = count_result.scalar()

    return {
        "items": [_to_response(k).model_dump() for k in keys],
        "total": total,
        "page": page,
        "size": size,
    }


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Revoke (deactivate) an API key."""
    result = await db.execute(
        select(APIKey).where(APIKey.id == key_id, APIKey.organization_id == user.organization_id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = False
    await db.commit()


@router.post("/{key_id}/regenerate", status_code=201)
async def regenerate_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Regenerate an API key — old key is immediately invalidated."""
    result = await db.execute(
        select(APIKey).where(APIKey.id == key_id, APIKey.organization_id == user.organization_id)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    raw_key = f"egglogu_{secrets.token_hex(4)}_{secrets.token_hex(24)}"
    api_key.key_prefix = raw_key[:KEY_PREFIX_LENGTH]
    api_key.key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    api_key.is_active = True
    api_key.total_requests = 0

    await db.commit()

    return APIKeyCreatedResponse(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        expires_at=api_key.expires_at,
        last_used_at=api_key.last_used_at,
        total_requests=api_key.total_requests,
        description=api_key.description,
        created_at=api_key.created_at,
        full_key=raw_key,
    ).model_dump()


# ─── Helpers ─────────────────────────────────────────────────────────

def _to_response(k: APIKey) -> APIKeyResponse:
    return APIKeyResponse(
        id=k.id,
        name=k.name,
        key_prefix=k.key_prefix,
        scopes=k.scopes,
        is_active=k.is_active,
        expires_at=k.expires_at,
        last_used_at=k.last_used_at,
        total_requests=k.total_requests,
        description=k.description,
        created_at=k.created_at,
    )
