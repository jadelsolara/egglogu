"""
Traceability API — Core product batch tracking (FarmLogU Platform).

Works for any vertical: eggs, pork, beef, dairy, crops.
Batch code format: {PREFIX}-{ORIGIN}-{DATE}-{SEQ}
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.models.traceability import ProductCategory
from src.schemas.traceability import (
    TraceabilityBatchCreate,
    TraceabilityBatchRead,
    TraceabilityBatchUpdate,
)
from src.services.traceability_service import TraceabilityService

router = APIRouter(prefix="/traceability", tags=["traceability"])


@router.get("/batches", response_model=list[TraceabilityBatchRead])
async def list_batches(
    category: ProductCategory | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Lista paginada de lotes, con filtro opcional por categoría."""
    svc = TraceabilityService(db, user.organization_id, user.id)
    return await svc.list_batches(category=category, page=page, size=size)


@router.get("/batches/{batch_id}", response_model=TraceabilityBatchRead)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Obtiene un lote por ID."""
    svc = TraceabilityService(db, user.organization_id, user.id)
    return await svc.get_batch(batch_id)


@router.post(
    "/batches",
    response_model=TraceabilityBatchRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_batch(
    data: TraceabilityBatchCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Crea un nuevo lote con código y QR generados automáticamente."""
    svc = TraceabilityService(db, user.organization_id, user.id)
    return await svc.create_batch(data)


@router.put("/batches/{batch_id}", response_model=TraceabilityBatchRead)
async def update_batch(
    batch_id: uuid.UUID,
    data: TraceabilityBatchUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Actualiza campos de un lote existente."""
    svc = TraceabilityService(db, user.organization_id, user.id)
    return await svc.update_batch(batch_id, data)


@router.delete("/batches/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Elimina un lote de forma permanente."""
    svc = TraceabilityService(db, user.organization_id, user.id)
    await svc.delete_batch(batch_id)
