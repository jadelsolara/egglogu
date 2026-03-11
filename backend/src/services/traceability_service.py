"""Servicio de Trazabilidad — gestión de lotes de producto (FarmLogU Platform)."""

import uuid
from datetime import date as date_type

from sqlalchemy import func, select

from src.config import settings
from src.models.traceability import TraceabilityBatch, ProductCategory
from src.schemas.traceability import TraceabilityBatchCreate, TraceabilityBatchUpdate
from src.services.base import BaseService

# Prefijo de código por categoría de producto
CATEGORY_PREFIX = {
    ProductCategory.EGGS: "EGG",
    ProductCategory.POULTRY_MEAT: "PLT",
    ProductCategory.PORK: "PRK",
    ProductCategory.BEEF: "BEF",
    ProductCategory.DAIRY: "DRY",
    ProductCategory.CROPS: "CRP",
    ProductCategory.FEED: "FED",
    ProductCategory.BYPRODUCT: "BYP",
    ProductCategory.OTHER: "OTH",
}


class TraceabilityService(BaseService):
    """Operaciones CRUD para lotes de trazabilidad multi-vertical."""

    # ── Helpers internos ──────────────────────────────────────────────

    async def _generate_batch_code(
        self,
        category: ProductCategory,
        origin_name: str | None,
        batch_date: date_type,
    ) -> str:
        """Genera código de lote: {CAT}-{ORIGIN}-{DATE}-{SEQ}.

        Ejemplos:
        - EGG-LOTE1-20260308-001 (huevos del lote LOTE1)
        - PRK-BARN2-20260308-001 (cerdo del galpón 2)
        - DRY-HERD3-20260308-001 (lácteos del hato 3)
        """
        prefix = CATEGORY_PREFIX.get(category, "OTH")
        origin_short = (origin_name or "GEN")[:8].upper().replace(" ", "")
        date_str = batch_date.strftime("%Y%m%d")
        code_prefix = f"{prefix}-{origin_short}-{date_str}"

        count_result = await self.db.execute(
            select(func.count()).where(
                TraceabilityBatch.batch_code.like(f"{code_prefix}%")
            )
        )
        seq = (count_result.scalar() or 0) + 1
        return f"{code_prefix}-{seq:03d}"

    # ── Operaciones públicas ──────────────────────────────────────────

    async def list_batches(
        self,
        *,
        category: ProductCategory | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list[TraceabilityBatch]:
        """Lista paginada de lotes, con filtro opcional por categoría."""
        stmt = self._scoped(TraceabilityBatch)
        if category:
            stmt = stmt.where(TraceabilityBatch.product_category == category)
        stmt = (
            stmt.order_by(TraceabilityBatch.date.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_batch(self, batch_id: uuid.UUID) -> TraceabilityBatch:
        """Obtiene un lote por ID (scoped a la organización)."""
        return await self._get(TraceabilityBatch, batch_id, error_msg="Batch not found")

    async def create_batch(self, data: TraceabilityBatchCreate) -> TraceabilityBatch:
        """Crea un nuevo lote con código y QR generados automáticamente."""
        origin_name = data.origin_location
        if not origin_name and data.source_id:
            origin_name = str(data.source_id)[:8]

        batch_code = await self._generate_batch_code(
            data.product_category, origin_name, data.date
        )
        qr_url = f"{settings.FRONTEND_URL}/trace/{batch_code}"

        obj = TraceabilityBatch(
            **data.model_dump(),
            batch_code=batch_code,
            qr_code=qr_url,
            organization_id=self.org_id,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def update_batch(
        self, batch_id: uuid.UUID, data: TraceabilityBatchUpdate
    ) -> TraceabilityBatch:
        """Actualiza campos de un lote existente."""
        return await self._update(
            TraceabilityBatch, batch_id, data, error_msg="Batch not found"
        )

    async def delete_batch(self, batch_id: uuid.UUID) -> None:
        """Elimina un lote de forma permanente."""
        await self._delete(TraceabilityBatch, batch_id, error_msg="Batch not found")
