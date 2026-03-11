"""Webhook management API — CRUD + delivery logs."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_current_user
from src.models.webhook import Webhook
from src.services.webhook_service import WebhookService

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ─── Schemas ─────────────────────────────────────────────────────────


class WebhookCreate(BaseModel):
    name: str
    url: str
    events: list[str]
    description: str | None = None


class WebhookUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    events: list[str] | None = None
    is_active: bool | None = None
    description: str | None = None


class WebhookResponse(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    events: list[str]
    is_active: bool
    description: str | None
    secret: str
    total_deliveries: int
    total_failures: int
    last_delivery_at: datetime | None
    created_at: datetime


class WebhookDeliveryResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    response_status: int | None
    latency_ms: int | None
    success: bool
    attempt: int
    error: str | None
    created_at: datetime


# ─── CRUD ────────────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_webhook(
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Crea un nuevo webhook saliente."""
    svc = WebhookService(db, user.organization_id, user.id)
    webhook = await svc.create_webhook(
        name=body.name,
        url=body.url,
        events=body.events,
        description=body.description,
    )
    return _to_response(webhook)


@router.get("")
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """Lista todos los webhooks de la organización."""
    svc = WebhookService(db, user.organization_id, user.id)
    result = await svc.list_webhooks(page=page, size=size)
    return {
        "items": [_to_response(w) for w in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "size": result["size"],
    }


@router.get("/{webhook_id}")
async def get_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Obtiene los detalles de un webhook."""
    svc = WebhookService(db, user.organization_id, user.id)
    webhook = await svc.get_webhook(webhook_id)
    return _to_response(webhook)


@router.put("/{webhook_id}")
async def update_webhook(
    webhook_id: uuid.UUID,
    body: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Actualiza la configuración de un webhook."""
    svc = WebhookService(db, user.organization_id, user.id)
    webhook = await svc.update_webhook(
        webhook_id,
        name=body.name,
        url=body.url,
        events=body.events,
        is_active=body.is_active,
        description=body.description,
    )
    return _to_response(webhook)


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Elimina un webhook y todos sus registros de entrega."""
    svc = WebhookService(db, user.organization_id, user.id)
    await svc.delete_webhook(webhook_id)


@router.post("/{webhook_id}/rotate-secret")
async def rotate_webhook_secret(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Rota el secreto de firma del webhook."""
    svc = WebhookService(db, user.organization_id, user.id)
    new_secret = await svc.rotate_secret(webhook_id)
    return {"secret": new_secret}


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Envía un evento de prueba al webhook."""
    svc = WebhookService(db, user.organization_id, user.id)
    webhook = await svc.get_webhook_for_test(webhook_id)

    from src.tasks.webhooks import deliver_webhook

    deliver_webhook.delay(
        str(webhook.id),
        "webhook.test",
        {"message": "This is a test event from EGGlogU", "webhook_id": str(webhook.id)},
    )
    return {"status": "test_queued"}


# ─── Delivery Logs ──────────────────────────────────────────────────


@router.get("/{webhook_id}/deliveries")
async def list_deliveries(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """Lista los intentos de entrega de un webhook."""
    svc = WebhookService(db, user.organization_id, user.id)
    result = await svc.list_deliveries(webhook_id, page=page, size=size)
    return {
        "items": [
            WebhookDeliveryResponse(
                id=d.id,
                event_type=d.event_type,
                response_status=d.response_status,
                latency_ms=d.latency_ms,
                success=d.success,
                attempt=d.attempt,
                error=d.error,
                created_at=d.created_at,
            ).model_dump()
            for d in result["items"]
        ],
        "total": result["total"],
        "page": result["page"],
        "size": result["size"],
    }


# ─── Helpers ─────────────────────────────────────────────────────────


def _to_response(w: Webhook) -> dict:
    return WebhookResponse(
        id=w.id,
        name=w.name,
        url=w.url,
        events=w.events,
        is_active=w.is_active,
        description=w.description,
        secret=w.secret,
        total_deliveries=w.total_deliveries,
        total_failures=w.total_failures,
        last_delivery_at=w.last_delivery_at,
        created_at=w.created_at,
    ).model_dump()
