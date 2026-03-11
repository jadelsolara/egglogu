"""API Key management endpoints — create, list, revoke keys for external access."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_current_user
from src.models.api_key import APIKey
from src.services.api_keys_service import APIKeyService

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


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
    """Solo se retorna al crear — incluye la llave completa (se muestra una vez)."""

    full_key: str


# ─── Endpoints ───────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_api_key(
    body: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Crea una nueva API key. La llave completa se retorna UNA sola vez."""
    svc = APIKeyService(db, user.organization_id, user.id)
    api_key, raw_key = await svc.create_key(
        name=body.name,
        scopes=body.scopes,
        description=body.description,
        expires_in_days=body.expires_in_days,
    )
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
    """Lista todas las API keys de la organización (enmascaradas)."""
    svc = APIKeyService(db, user.organization_id, user.id)
    result = await svc.list_keys(page=page, size=size)
    return {
        "items": [_to_response(k).model_dump() for k in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "size": result["size"],
    }


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Revoca (desactiva) una API key."""
    svc = APIKeyService(db, user.organization_id, user.id)
    await svc.revoke_key(key_id)


@router.post("/{key_id}/regenerate", status_code=201)
async def regenerate_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Regenera una API key — la anterior queda invalidada de inmediato."""
    svc = APIKeyService(db, user.organization_id, user.id)
    api_key, raw_key = await svc.regenerate_key(key_id)
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
