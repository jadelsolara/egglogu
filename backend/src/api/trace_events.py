"""
Traceability Events API — EPCIS 2.0 + FSMA 204 Compliant (FarmLogU Platform).

Endpoints for:
- Location registry (GS1 GLN)
- Event logging (EPCIS CTEs with KDEs)
- Batch lineage (parent/child transformation chains)
- Forward & backward trace
- Recall management (mock + real)
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.trace_events import (
    TraceLocationCreate, TraceLocationUpdate, TraceLocationRead,
    TraceEventCreate, TraceEventRead,
    BatchLineageCreate, BatchLineageRead,
    RecallCreate, RecallRead,
    FullTraceResponse,
)
from src.services.trace_events_service import TraceEventsService

router = APIRouter(prefix="/traceability", tags=["traceability-events"])


def _svc(db: AsyncSession, user: User) -> TraceEventsService:
    return TraceEventsService(db, user.organization_id, user.id)


# ═══════════════════════════════════════════════════════════════════
# LOCATIONS (GS1 GLN registry)
# ═══════════════════════════════════════════════════════════════════

@router.get("/locations", response_model=list[TraceLocationRead])
async def list_locations(
    location_type: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.list_locations(location_type=location_type, page=page, size=size)


@router.post("/locations", response_model=TraceLocationRead, status_code=status.HTTP_201_CREATED)
async def create_location(
    data: TraceLocationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.create_location(data)


@router.put("/locations/{location_id}", response_model=TraceLocationRead)
async def update_location(
    location_id: uuid.UUID,
    data: TraceLocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.update_location(location_id, data)


# ═══════════════════════════════════════════════════════════════════
# EVENTS (EPCIS 2.0 CTE/KDE logging)
# ═══════════════════════════════════════════════════════════════════

@router.get("/events", response_model=list[TraceEventRead])
async def list_events(
    batch_id: uuid.UUID | None = None,
    cte: str | None = None,
    location_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.list_events(
        batch_id=batch_id,
        cte=cte,
        location_id=location_id,
        date_from=date_from,
        date_to=date_to,
        page=page,
        size=size,
    )


@router.post("/events", response_model=TraceEventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: TraceEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.create_event(data)


# ═══════════════════════════════════════════════════════════════════
# BATCH LINEAGE (transformation chains)
# ═══════════════════════════════════════════════════════════════════

@router.post("/lineage", response_model=BatchLineageRead, status_code=status.HTTP_201_CREATED)
async def create_lineage(
    data: BatchLineageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.create_lineage(data)


@router.get("/lineage/{batch_id}/parents", response_model=list[BatchLineageRead])
async def get_parent_batches(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.get_parent_batches(batch_id)


@router.get("/lineage/{batch_id}/children", response_model=list[BatchLineageRead])
async def get_child_batches(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.get_child_batches(batch_id)


# ═══════════════════════════════════════════════════════════════════
# FORWARD & BACKWARD TRACE — The killer feature
# ═══════════════════════════════════════════════════════════════════

@router.get("/trace/{batch_id}/full", response_model=FullTraceResponse)
async def full_trace(
    batch_id: uuid.UUID,
    max_depth: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.full_trace(batch_id, max_depth=max_depth)


# ═══════════════════════════════════════════════════════════════════
# RECALL MANAGEMENT — Mock recall + real recall execution
# ═══════════════════════════════════════════════════════════════════

@router.post("/recalls", response_model=RecallRead, status_code=status.HTTP_201_CREATED)
async def create_recall(
    data: RecallCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.create_recall(data)


@router.get("/recalls", response_model=list[RecallRead])
async def list_recalls(
    status_filter: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.list_recalls(status_filter=status_filter, page=page, size=size)


@router.get("/recalls/{recall_id}", response_model=RecallRead)
async def get_recall(
    recall_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.get_recall(recall_id)


@router.post("/recalls/{recall_id}/complete")
async def complete_recall(
    recall_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    svc = _svc(db, user)
    return await svc.complete_recall(recall_id)
