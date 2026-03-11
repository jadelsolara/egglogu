"""Servicio de API Keys — generación, listado, revocación y regeneración."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from src.models.api_key import APIKey
from src.services.base import BaseService

KEY_PREFIX_LENGTH = 8


class APIKeyService(BaseService):
    """Operaciones CRUD para llaves de acceso externo (API keys)."""

    # ── Helpers internos ──────────────────────────────────────────────

    @staticmethod
    def _generate_raw_key() -> str:
        """Genera una llave cruda con formato egglogu_<prefix>_<random>."""
        return f"egglogu_{secrets.token_hex(4)}_{secrets.token_hex(24)}"

    # ── Operaciones públicas ──────────────────────────────────────────

    async def create_key(
        self,
        *,
        name: str,
        scopes: list[str],
        description: str | None,
        expires_in_days: int | None,
    ) -> tuple[APIKey, str]:
        """Crea una nueva API key. Retorna (objeto, llave_cruda).

        La llave cruda solo se muestra una vez; se almacena únicamente su hash.
        """
        raw_key = self._generate_raw_key()
        prefix = raw_key[:KEY_PREFIX_LENGTH]
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        api_key = APIKey(
            name=name,
            key_prefix=prefix,
            key_hash=key_hash,
            scopes=scopes,
            description=description,
            expires_at=expires_at,
            organization_id=self.org_id,
            created_by=self.user_id,
        )
        self.db.add(api_key)
        await self.db.commit()
        await self.db.refresh(api_key)
        return api_key, raw_key

    async def list_keys(self, *, page: int = 1, size: int = 20) -> dict:
        """Lista paginada de API keys de la organización (enmascaradas)."""
        offset = (page - 1) * size
        result = await self.db.execute(
            select(APIKey)
            .where(APIKey.organization_id == self.org_id)
            .order_by(APIKey.created_at.desc())
            .offset(offset)
            .limit(size)
        )
        keys = result.scalars().all()

        count_result = await self.db.execute(
            select(func.count(APIKey.id)).where(APIKey.organization_id == self.org_id)
        )
        total = count_result.scalar()

        return {"items": list(keys), "total": total, "page": page, "size": size}

    async def revoke_key(self, key_id: uuid.UUID) -> None:
        """Revoca (desactiva) una API key."""
        api_key = await self._get(APIKey, key_id, error_msg="API key not found")
        api_key.is_active = False
        await self.db.commit()

    async def regenerate_key(self, key_id: uuid.UUID) -> tuple[APIKey, str]:
        """Regenera una API key — la anterior queda invalidada de inmediato.

        Retorna (objeto actualizado, nueva llave cruda).
        """
        api_key = await self._get(APIKey, key_id, error_msg="API key not found")

        raw_key = self._generate_raw_key()
        api_key.key_prefix = raw_key[:KEY_PREFIX_LENGTH]
        api_key.key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        api_key.is_active = True
        api_key.total_requests = 0

        await self.db.commit()
        return api_key, raw_key
