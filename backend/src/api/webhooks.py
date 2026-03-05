"""Webhook management API — CRUD + delivery logs."""

import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_current_user
from src.models.webhook import Webhook, WebhookDelivery

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
    """Create a new outbound webhook."""
    webhook = Webhook(
        name=body.name,
        url=body.url,
        events=body.events,
        description=body.description,
        secret=secrets.token_hex(32),
        organization_id=user.organization_id,
        created_by=user.id,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return _to_response(webhook)


@router.get("")
async def list_webhooks(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """List all webhooks for the organization."""
    offset = (page - 1) * size
    result = await db.execute(
        select(Webhook)
        .where(Webhook.organization_id == user.organization_id)
        .order_by(Webhook.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    webhooks = result.scalars().all()

    count_result = await db.execute(
        select(func.count(Webhook.id)).where(Webhook.organization_id == user.organization_id)
    )
    total = count_result.scalar()

    return {
        "items": [_to_response(w) for w in webhooks],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/{webhook_id}")
async def get_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get webhook details."""
    webhook = await _get_webhook_or_404(db, webhook_id, user.organization_id)
    return _to_response(webhook)


@router.put("/{webhook_id}")
async def update_webhook(
    webhook_id: uuid.UUID,
    body: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Update webhook configuration."""
    webhook = await _get_webhook_or_404(db, webhook_id, user.organization_id)

    if body.name is not None:
        webhook.name = body.name
    if body.url is not None:
        webhook.url = body.url
    if body.events is not None:
        webhook.events = body.events
    if body.is_active is not None:
        webhook.is_active = body.is_active
    if body.description is not None:
        webhook.description = body.description

    await db.commit()
    await db.refresh(webhook)
    return _to_response(webhook)


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete a webhook and all its delivery logs."""
    webhook = await _get_webhook_or_404(db, webhook_id, user.organization_id)
    await db.delete(webhook)
    await db.commit()


@router.post("/{webhook_id}/rotate-secret")
async def rotate_webhook_secret(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Rotate the webhook signing secret."""
    webhook = await _get_webhook_or_404(db, webhook_id, user.organization_id)
    webhook.secret = secrets.token_hex(32)
    await db.commit()
    return {"secret": webhook.secret}


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Send a test event to the webhook."""
    webhook = await _get_webhook_or_404(db, webhook_id, user.organization_id)

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
    """List delivery attempts for a webhook."""
    await _get_webhook_or_404(db, webhook_id, user.organization_id)

    offset = (page - 1) * size
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    deliveries = result.scalars().all()

    count_result = await db.execute(
        select(func.count(WebhookDelivery.id)).where(WebhookDelivery.webhook_id == webhook_id)
    )
    total = count_result.scalar()

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
            for d in deliveries
        ],
        "total": total,
        "page": page,
        "size": size,
    }


# ─── Helpers ─────────────────────────────────────────────────────────

async def _get_webhook_or_404(db: AsyncSession, webhook_id: uuid.UUID, org_id) -> Webhook:
    result = await db.execute(
        select(Webhook).where(Webhook.id == webhook_id, Webhook.organization_id == org_id)
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


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
