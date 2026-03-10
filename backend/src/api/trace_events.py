"""
Traceability Events API — EPCIS 2.0 + FSMA 204 Compliant (FarmLogU Platform).

Endpoints for:
- Location registry (GS1 GLN)
- Event logging (EPCIS CTEs with KDEs)
- Batch lineage (parent/child transformation chains)
- Forward & backward trace
- Recall management (mock + real)
"""

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.traceability import TraceabilityBatch, ProductCategory, BatchStatus
from src.models.trace_events import (
    TraceLocation, TraceEvent, TraceEventItem, BatchLineage,
    TraceRecall, RecallBatch, RecallStatus, TraceEventType,
)
from src.schemas.trace_events import (
    TraceLocationCreate, TraceLocationUpdate, TraceLocationRead,
    TraceEventCreate, TraceEventRead,
    BatchLineageCreate, BatchLineageRead,
    RecallCreate, RecallRead,
    TraceChainNode, TraceChainEvent, FullTraceResponse,
)

router = APIRouter(prefix="/traceability", tags=["traceability-events"])


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
    stmt = select(TraceLocation).where(
        TraceLocation.organization_id == user.organization_id
    )
    if location_type:
        stmt = stmt.where(TraceLocation.location_type == location_type)
    stmt = stmt.order_by(TraceLocation.name).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/locations", response_model=TraceLocationRead, status_code=status.HTTP_201_CREATED)
async def create_location(
    data: TraceLocationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    obj = TraceLocation(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/locations/{location_id}", response_model=TraceLocationRead)
async def update_location(
    location_id: uuid.UUID,
    data: TraceLocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    result = await db.execute(
        select(TraceLocation).where(
            TraceLocation.id == location_id,
            TraceLocation.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Location not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ═══════════════════════════════════════════════════════════════════
# EVENTS (EPCIS 2.0 CTE/KDE logging)
# ═══════════════════════════════════════════════════════════════════

def _compute_event_hash(event_data: dict, prev_hash: str | None = None) -> str:
    """SHA-256 hash for tamper detection (hash-chain)."""
    payload = json.dumps(event_data, sort_keys=True, default=str)
    if prev_hash:
        payload = prev_hash + payload
    return hashlib.sha256(payload.encode()).hexdigest()


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
    stmt = (
        select(TraceEvent)
        .options(selectinload(TraceEvent.items))
        .where(TraceEvent.organization_id == user.organization_id)
    )
    if batch_id:
        stmt = stmt.where(
            or_(
                TraceEvent.batch_id == batch_id,
                TraceEvent.items.any(TraceEventItem.batch_id == batch_id),
            )
        )
    if cte:
        stmt = stmt.where(TraceEvent.cte == cte)
    if location_id:
        stmt = stmt.where(TraceEvent.location_id == location_id)
    if date_from:
        stmt = stmt.where(TraceEvent.event_time >= date_from)
    if date_to:
        stmt = stmt.where(TraceEvent.event_time <= date_to)
    stmt = stmt.order_by(TraceEvent.event_time.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.post("/events", response_model=TraceEventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: TraceEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    # Get previous event hash for chain
    prev_result = await db.execute(
        select(TraceEvent.event_hash)
        .where(TraceEvent.organization_id == user.organization_id)
        .order_by(TraceEvent.created_at.desc())
        .limit(1)
    )
    prev_hash = prev_result.scalar_one_or_none()

    event_dict = data.model_dump(exclude={"items"})
    event_hash = _compute_event_hash(event_dict, prev_hash)

    event = TraceEvent(
        **event_dict,
        organization_id=user.organization_id,
        recorded_by=user.id,
        event_hash=event_hash,
        prev_event_hash=prev_hash,
    )
    db.add(event)
    await db.flush()

    # Add event items
    for item_data in data.items:
        item = TraceEventItem(
            **item_data.model_dump(),
            event_id=event.id,
        )
        db.add(item)

    # Auto-update batch status based on CTE
    if data.batch_id:
        batch_result = await db.execute(
            select(TraceabilityBatch).where(TraceabilityBatch.id == data.batch_id)
        )
        batch = batch_result.scalar_one_or_none()
        if batch:
            _auto_update_batch_status(batch, data)

    await db.flush()
    # Reload with items
    result = await db.execute(
        select(TraceEvent)
        .options(selectinload(TraceEvent.items))
        .where(TraceEvent.id == event.id)
    )
    return result.scalar_one()


def _auto_update_batch_status(batch: TraceabilityBatch, event_data: TraceEventCreate):
    """Auto-update batch status based on the CTE recorded."""
    from src.models.trace_events import CriticalTrackingEvent
    cte_status_map = {
        CriticalTrackingEvent.INITIAL_PACKING: BatchStatus.CREATED,
        CriticalTrackingEvent.STORING: BatchStatus.IN_STORAGE,
        CriticalTrackingEvent.SHIPPING: BatchStatus.IN_TRANSIT,
        CriticalTrackingEvent.RECEIVING: BatchStatus.DELIVERED,
        CriticalTrackingEvent.RECALLING: BatchStatus.RECALLED,
    }
    new_status = cte_status_map.get(event_data.cte)
    if new_status:
        batch.status = new_status


# ═══════════════════════════════════════════════════════════════════
# BATCH LINEAGE (transformation chains)
# ═══════════════════════════════════════════════════════════════════

@router.post("/lineage", response_model=BatchLineageRead, status_code=status.HTTP_201_CREATED)
async def create_lineage(
    data: BatchLineageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    obj = BatchLineage(**data.model_dump())
    db.add(obj)
    await db.flush()
    return obj


@router.get("/lineage/{batch_id}/parents", response_model=list[BatchLineageRead])
async def get_parent_batches(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Get all parent (input) batches for a given batch."""
    result = await db.execute(
        select(BatchLineage).where(BatchLineage.child_batch_id == batch_id)
    )
    return result.scalars().all()


@router.get("/lineage/{batch_id}/children", response_model=list[BatchLineageRead])
async def get_child_batches(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Get all child (output) batches produced from a given batch."""
    result = await db.execute(
        select(BatchLineage).where(BatchLineage.parent_batch_id == batch_id)
    )
    return result.scalars().all()


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
    """Full forward + backward trace from a batch.

    Returns the complete supply chain graph: all inputs that went
    into this batch (backward) and all products that came from it (forward),
    plus a timeline of all EPCIS events.

    Compliant with:
    - FSMA 204: full trace within 24 hours
    - EU 178/2002: one step back, one step forward (and beyond)
    - GS1 EPCIS 2.0: event-based traceability
    """
    start_time = time.monotonic()

    # Get origin batch
    result = await db.execute(
        select(TraceabilityBatch)
        .options(selectinload(TraceabilityBatch.farm))
        .where(
            TraceabilityBatch.id == batch_id,
            TraceabilityBatch.organization_id == user.organization_id,
        )
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise NotFoundError("Batch not found")

    origin_node = _batch_to_node(batch, depth=0)

    # Backward trace (inputs → this batch)
    backward_chain = await _trace_backward(db, batch_id, max_depth)

    # Forward trace (this batch → outputs)
    forward_chain = await _trace_forward(db, batch_id, max_depth)

    # Get all events for all batches in the chain
    all_batch_ids = (
        {batch_id}
        | {n.batch_id for n in backward_chain}
        | {n.batch_id for n in forward_chain}
    )
    events = await _get_events_for_batches(db, all_batch_ids, user.organization_id)

    trace_time_ms = int((time.monotonic() - start_time) * 1000)

    return FullTraceResponse(
        origin_batch=origin_node,
        backward_chain=backward_chain,
        forward_chain=forward_chain,
        events=events,
        trace_time_ms=trace_time_ms,
    )


async def _trace_backward(
    db: AsyncSession, batch_id: uuid.UUID, max_depth: int
) -> list[TraceChainNode]:
    """Recursively trace all inputs (parents) that went into a batch."""
    visited = set()
    result_nodes = []

    async def _recurse(current_id: uuid.UUID, depth: int):
        if depth > max_depth or current_id in visited:
            return
        visited.add(current_id)

        lineage_result = await db.execute(
            select(BatchLineage)
            .options(
                selectinload(BatchLineage.parent_batch).selectinload(TraceabilityBatch.farm)
            )
            .where(BatchLineage.child_batch_id == current_id)
        )
        lineages = lineage_result.scalars().all()

        for lineage in lineages:
            parent = lineage.parent_batch
            if parent and parent.id not in visited:
                result_nodes.append(_batch_to_node(parent, depth=-depth))
                await _recurse(parent.id, depth + 1)

    await _recurse(batch_id, 1)
    return result_nodes


async def _trace_forward(
    db: AsyncSession, batch_id: uuid.UUID, max_depth: int
) -> list[TraceChainNode]:
    """Recursively trace all outputs (children) produced from a batch."""
    visited = set()
    result_nodes = []

    async def _recurse(current_id: uuid.UUID, depth: int):
        if depth > max_depth or current_id in visited:
            return
        visited.add(current_id)

        lineage_result = await db.execute(
            select(BatchLineage)
            .options(
                selectinload(BatchLineage.child_batch).selectinload(TraceabilityBatch.farm)
            )
            .where(BatchLineage.parent_batch_id == current_id)
        )
        lineages = lineage_result.scalars().all()

        for lineage in lineages:
            child = lineage.child_batch
            if child and child.id not in visited:
                result_nodes.append(_batch_to_node(child, depth=depth))
                await _recurse(child.id, depth + 1)

    await _recurse(batch_id, 1)
    return result_nodes


async def _get_events_for_batches(
    db: AsyncSession, batch_ids: set[uuid.UUID], org_id: uuid.UUID
) -> list[TraceChainEvent]:
    """Get all events related to a set of batches, sorted by time."""
    result = await db.execute(
        select(TraceEvent)
        .options(selectinload(TraceEvent.location))
        .where(
            TraceEvent.organization_id == org_id,
            or_(
                TraceEvent.batch_id.in_(batch_ids),
                TraceEvent.id.in_(
                    select(TraceEventItem.event_id).where(
                        TraceEventItem.batch_id.in_(batch_ids)
                    )
                ),
            ),
        )
        .order_by(TraceEvent.event_time.asc())
    )
    events = result.scalars().unique().all()
    return [
        TraceChainEvent(
            event_id=e.id,
            event_type=e.event_type.value,
            cte=e.cte.value,
            event_time=e.event_time,
            location_name=e.location.name if e.location else None,
            description=e.description,
            disposition=e.disposition,
            temperature_c=e.temperature_c,
        )
        for e in events
    ]


def _batch_to_node(batch: TraceabilityBatch, depth: int) -> TraceChainNode:
    return TraceChainNode(
        batch_id=batch.id,
        batch_code=batch.batch_code,
        product_category=batch.product_category.value,
        product_name=batch.product_name,
        quantity=batch.quantity,
        unit_of_measure=batch.unit_of_measure,
        status=batch.status.value,
        date=batch.date,
        origin_location=batch.origin_location,
        farm_name=batch.farm.name if batch.farm else None,
        depth=depth,
    )


# ═══════════════════════════════════════════════════════════════════
# RECALL MANAGEMENT — Mock recall + real recall execution
# ═══════════════════════════════════════════════════════════════════

@router.post("/recalls", response_model=RecallRead, status_code=status.HTTP_201_CREATED)
async def create_recall(
    data: RecallCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Initiate a recall (mock drill or real).

    Automatically identifies all affected batches based on scope,
    then traces forward to find every downstream product.
    Tracks time-to-trace for FSMA 204 compliance.
    """
    trace_start = datetime.now(timezone.utc)

    # Generate recall number
    count_result = await db.execute(
        select(func.count()).select_from(TraceRecall).where(
            TraceRecall.organization_id == user.organization_id
        )
    )
    seq = (count_result.scalar() or 0) + 1
    recall_number = f"RCL-{datetime.now().strftime('%Y%m%d')}-{seq:04d}"

    recall = TraceRecall(
        recall_number=recall_number,
        status=RecallStatus.MOCK if data.is_mock else RecallStatus.ACTIVE,
        scope=data.scope,
        reason=data.reason,
        severity=data.severity,
        trigger_batch_id=data.trigger_batch_id,
        product_category=data.product_category,
        date_from=data.date_from,
        date_to=data.date_to,
        organization_id=user.organization_id,
        initiated_by=user.id,
        initiated_at=trace_start,
        trace_started_at=trace_start,
    )
    db.add(recall)
    await db.flush()

    # Find affected batches based on scope
    affected_batches = await _find_affected_batches(
        db, user.organization_id, data
    )

    # For each trigger batch, also trace forward to find downstream products
    all_affected_ids = {b.id for b in affected_batches}
    if data.trigger_batch_id:
        forward = await _trace_forward(db, data.trigger_batch_id, max_depth=20)
        for node in forward:
            if node.batch_id not in all_affected_ids:
                batch_result = await db.execute(
                    select(TraceabilityBatch).where(TraceabilityBatch.id == node.batch_id)
                )
                batch = batch_result.scalar_one_or_none()
                if batch:
                    affected_batches.append(batch)
                    all_affected_ids.add(batch.id)

    # Create recall-batch links and mark batches as recalled
    total_units = 0
    clients_set = set()
    for batch in affected_batches:
        rb = RecallBatch(
            recall_id=recall.id,
            batch_id=batch.id,
            client_id=batch.client_id,
            units_in_batch=batch.quantity,
        )
        db.add(rb)
        total_units += batch.quantity
        batch.status = BatchStatus.RECALLED
        if batch.client_id:
            clients_set.add(batch.client_id)

    recall.batches_affected = len(affected_batches)
    recall.units_affected = total_units
    recall.clients_notified = len(clients_set)
    recall.trace_completed_at = datetime.now(timezone.utc)

    await db.flush()
    return recall


async def _find_affected_batches(
    db: AsyncSession, org_id: uuid.UUID, data: RecallCreate
) -> list[TraceabilityBatch]:
    """Find all batches matching recall scope criteria."""
    stmt = select(TraceabilityBatch).where(
        TraceabilityBatch.organization_id == org_id,
        TraceabilityBatch.status != BatchStatus.RECALLED,
    )

    if data.scope.value == "batch" and data.trigger_batch_id:
        stmt = stmt.where(TraceabilityBatch.id == data.trigger_batch_id)
    elif data.scope.value == "product" and data.product_category:
        stmt = stmt.where(TraceabilityBatch.product_category == data.product_category)
    elif data.scope.value == "date_range":
        if data.date_from:
            stmt = stmt.where(TraceabilityBatch.date >= data.date_from)
        if data.date_to:
            stmt = stmt.where(TraceabilityBatch.date <= data.date_to)

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/recalls", response_model=list[RecallRead])
async def list_recalls(
    status_filter: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    stmt = select(TraceRecall).where(
        TraceRecall.organization_id == user.organization_id
    )
    if status_filter:
        stmt = stmt.where(TraceRecall.status == status_filter)
    stmt = stmt.order_by(TraceRecall.created_at.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/recalls/{recall_id}", response_model=RecallRead)
async def get_recall(
    recall_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    result = await db.execute(
        select(TraceRecall).where(
            TraceRecall.id == recall_id,
            TraceRecall.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Recall not found")
    return obj


@router.post("/recalls/{recall_id}/complete")
async def complete_recall(
    recall_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("traceability")),
):
    """Mark a recall as completed."""
    result = await db.execute(
        select(TraceRecall).where(
            TraceRecall.id == recall_id,
            TraceRecall.organization_id == user.organization_id,
        )
    )
    recall = result.scalar_one_or_none()
    if not recall:
        raise NotFoundError("Recall not found")
    recall.status = RecallStatus.COMPLETED
    recall.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return {"status": "completed", "recall_number": recall.recall_number}
