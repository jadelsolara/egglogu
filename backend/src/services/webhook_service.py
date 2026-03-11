"""Servicio de Webhooks — CRUD, rotación de secreto y logs de entrega."""

import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.webhook import Webhook, WebhookDelivery
from src.services.base import BaseService


class WebhookService(BaseService):
    """Operaciones CRUD para webhooks salientes y sus registros de entrega."""

    # ── Helpers internos ──────────────────────────────────────────────

    async def _get_webhook(self, webhook_id: uuid.UUID) -> Webhook:
        """Obtiene un webhook por ID (scoped a la organización)."""
        return await self._get(Webhook, webhook_id, error_msg="Webhook not found")

    # ── Operaciones públicas ──────────────────────────────────────────

    async def create_webhook(
        self,
        *,
        name: str,
        url: str,
        events: list[str],
        description: str | None,
    ) -> Webhook:
        """Crea un nuevo webhook saliente con secreto generado automáticamente."""
        webhook = Webhook(
            name=name,
            url=url,
            events=events,
            description=description,
            secret=secrets.token_hex(32),
            organization_id=self.org_id,
            created_by=self.user_id,
        )
        self.db.add(webhook)
        await self.db.commit()
        await self.db.refresh(webhook)
        return webhook

    async def list_webhooks(self, *, page: int = 1, size: int = 20) -> dict:
        """Lista paginada de webhooks de la organización."""
        offset = (page - 1) * size
        result = await self.db.execute(
            select(Webhook)
            .where(Webhook.organization_id == self.org_id)
            .order_by(Webhook.created_at.desc())
            .offset(offset)
            .limit(size)
        )
        webhooks = result.scalars().all()

        count_result = await self.db.execute(
            select(func.count(Webhook.id)).where(
                Webhook.organization_id == self.org_id
            )
        )
        total = count_result.scalar()

        return {"items": list(webhooks), "total": total, "page": page, "size": size}

    async def get_webhook(self, webhook_id: uuid.UUID) -> Webhook:
        """Obtiene los detalles de un webhook."""
        return await self._get_webhook(webhook_id)

    async def update_webhook(
        self,
        webhook_id: uuid.UUID,
        *,
        name: str | None = None,
        url: str | None = None,
        events: list[str] | None = None,
        is_active: bool | None = None,
        description: str | None = None,
    ) -> Webhook:
        """Actualiza la configuración de un webhook."""
        webhook = await self._get_webhook(webhook_id)

        if name is not None:
            webhook.name = name
        if url is not None:
            webhook.url = url
        if events is not None:
            webhook.events = events
        if is_active is not None:
            webhook.is_active = is_active
        if description is not None:
            webhook.description = description

        await self.db.commit()
        await self.db.refresh(webhook)
        return webhook

    async def delete_webhook(self, webhook_id: uuid.UUID) -> None:
        """Elimina un webhook y todos sus registros de entrega."""
        webhook = await self._get_webhook(webhook_id)
        await self.db.delete(webhook)
        await self.db.commit()

    async def rotate_secret(self, webhook_id: uuid.UUID) -> str:
        """Rota el secreto de firma del webhook. Retorna el nuevo secreto."""
        webhook = await self._get_webhook(webhook_id)
        webhook.secret = secrets.token_hex(32)
        await self.db.commit()
        return webhook.secret

    async def get_webhook_for_test(self, webhook_id: uuid.UUID) -> Webhook:
        """Obtiene un webhook para enviar un evento de prueba."""
        return await self._get_webhook(webhook_id)

    async def list_deliveries(
        self, webhook_id: uuid.UUID, *, page: int = 1, size: int = 20
    ) -> dict:
        """Lista paginada de intentos de entrega de un webhook."""
        # Verificar que el webhook pertenece a la organización
        await self._get_webhook(webhook_id)

        offset = (page - 1) * size
        result = await self.db.execute(
            select(WebhookDelivery)
            .where(WebhookDelivery.webhook_id == webhook_id)
            .order_by(WebhookDelivery.created_at.desc())
            .offset(offset)
            .limit(size)
        )
        deliveries = result.scalars().all()

        count_result = await self.db.execute(
            select(func.count(WebhookDelivery.id)).where(
                WebhookDelivery.webhook_id == webhook_id
            )
        )
        total = count_result.scalar()

        return {
            "items": list(deliveries),
            "total": total,
            "page": page,
            "size": size,
        }
