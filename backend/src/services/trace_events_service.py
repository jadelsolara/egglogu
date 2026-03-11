"""TraceEventsService — EPCIS 2.0 traceability business logic.

Locations, events (hash-chain), batch lineage, forward/backward trace,
recall management.
"""

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, or_
from sqlalchemy.orm import selectinload

from src.core.exceptions import NotFoundError
from src.models.traceability import TraceabilityBatch, BatchStatus
from src.models.trace_events import (
    TraceLocation,
    TraceEvent,
    TraceEventItem,
    BatchLineage,
    TraceRecall,
    RecallBatch,
    RecallStatus,
    CriticalTrackingEvent,
)
from src.schemas.trace_events import (
    TraceLocationCreate,
    TraceLocationUpdate,
    TraceEventCreate,
    BatchLineageCreate,
    RecallCreate,
    TraceChainNode,
    TraceChainEvent,
    FullTraceResponse,
)
from src.services.base import BaseService


# ── Pure helper (no DB) ───────────────────────────────────────────


def _compute_event_hash(event_data: dict, prev_hash: str | None = None) -> str:
    """SHA-256 hash for tamper detection (hash-chain)."""
    payload = json.dumps(event_data, sort_keys=True, default=str)
    if prev_hash:
        payload = prev_hash + payload
    return hashlib.sha256(payload.encode()).hexdigest()


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


def _auto_update_batch_status(batch: TraceabilityBatch, event_data: TraceEventCreate):
    """Auto-update batch status based on the CTE recorded."""
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


class TraceEventsService(BaseService):
    """Tenant-scoped EPCIS 2.0 traceability operations."""

    # ═══════════════════════════════════════════════════════════════
    # LOCATIONS
    # ═══════════════════════════════════════════════════════════════

    async def list_locations(
        self,
        *,
        location_type: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = select(TraceLocation).where(TraceLocation.organization_id == self.org_id)
        if location_type:
            stmt = stmt.where(TraceLocation.location_type == location_type)
        stmt = stmt.order_by(TraceLocation.name).offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_location(self, data: TraceLocationCreate) -> TraceLocation:
        obj = TraceLocation(**data.model_dump(), organization_id=self.org_id)
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def update_location(
        self, location_id: uuid.UUID, data: TraceLocationUpdate
    ) -> TraceLocation:
        result = await self.db.execute(
            select(TraceLocation).where(
                TraceLocation.id == location_id,
                TraceLocation.organization_id == self.org_id,
            )
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError("Location not found")
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        await self.db.flush()
        return obj

    # ═══════════════════════════════════════════════════════════════
    # EVENTS (hash-chain)
    # ═══════════════════════════════════════════════════════════════

    async def list_events(
        self,
        *,
        batch_id: uuid.UUID | None = None,
        cte: str | None = None,
        location_id: uuid.UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = (
            select(TraceEvent)
            .options(selectinload(TraceEvent.items))
            .where(TraceEvent.organization_id == self.org_id)
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
        stmt = (
            stmt.order_by(TraceEvent.event_time.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def create_event(self, data: TraceEventCreate) -> TraceEvent:
        # Get previous event hash for chain
        prev_result = await self.db.execute(
            select(TraceEvent.event_hash)
            .where(TraceEvent.organization_id == self.org_id)
            .order_by(TraceEvent.created_at.desc())
            .limit(1)
        )
        prev_hash = prev_result.scalar_one_or_none()

        event_dict = data.model_dump(exclude={"items"})
        event_hash = _compute_event_hash(event_dict, prev_hash)

        event = TraceEvent(
            **event_dict,
            organization_id=self.org_id,
            recorded_by=self.user_id,
            event_hash=event_hash,
            prev_event_hash=prev_hash,
        )
        self.db.add(event)
        await self.db.flush()

        # Add event items
        for item_data in data.items:
            item = TraceEventItem(
                **item_data.model_dump(),
                event_id=event.id,
            )
            self.db.add(item)

        # Auto-update batch status based on CTE
        if data.batch_id:
            batch_result = await self.db.execute(
                select(TraceabilityBatch).where(TraceabilityBatch.id == data.batch_id)
            )
            batch = batch_result.scalar_one_or_none()
            if batch:
                _auto_update_batch_status(batch, data)

        await self.db.flush()

        # Reload with items
        result = await self.db.execute(
            select(TraceEvent)
            .options(selectinload(TraceEvent.items))
            .where(TraceEvent.id == event.id)
        )
        return result.scalar_one()

    # ═══════════════════════════════════════════════════════════════
    # BATCH LINEAGE
    # ═══════════════════════════════════════════════════════════════

    async def create_lineage(self, data: BatchLineageCreate) -> BatchLineage:
        obj = BatchLineage(**data.model_dump())
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def get_parent_batches(self, batch_id: uuid.UUID) -> list:
        result = await self.db.execute(
            select(BatchLineage).where(BatchLineage.child_batch_id == batch_id)
        )
        return list(result.scalars().all())

    async def get_child_batches(self, batch_id: uuid.UUID) -> list:
        result = await self.db.execute(
            select(BatchLineage).where(BatchLineage.parent_batch_id == batch_id)
        )
        return list(result.scalars().all())

    # ═══════════════════════════════════════════════════════════════
    # FORWARD & BACKWARD TRACE
    # ═══════════════════════════════════════════════════════════════

    async def full_trace(
        self, batch_id: uuid.UUID, *, max_depth: int = 10
    ) -> FullTraceResponse:
        start_time = time.monotonic()

        # Get origin batch
        result = await self.db.execute(
            select(TraceabilityBatch)
            .options(selectinload(TraceabilityBatch.farm))
            .where(
                TraceabilityBatch.id == batch_id,
                TraceabilityBatch.organization_id == self.org_id,
            )
        )
        batch = result.scalar_one_or_none()
        if not batch:
            raise NotFoundError("Batch not found")

        origin_node = _batch_to_node(batch, depth=0)

        backward_chain = await self._trace_backward(batch_id, max_depth)
        forward_chain = await self._trace_forward(batch_id, max_depth)

        all_batch_ids = (
            {batch_id}
            | {n.batch_id for n in backward_chain}
            | {n.batch_id for n in forward_chain}
        )
        events = await self._get_events_for_batches(all_batch_ids)

        trace_time_ms = int((time.monotonic() - start_time) * 1000)

        return FullTraceResponse(
            origin_batch=origin_node,
            backward_chain=backward_chain,
            forward_chain=forward_chain,
            events=events,
            trace_time_ms=trace_time_ms,
        )

    async def _trace_backward(
        self, batch_id: uuid.UUID, max_depth: int
    ) -> list[TraceChainNode]:
        visited: set[uuid.UUID] = set()
        result_nodes: list[TraceChainNode] = []

        async def _recurse(current_id: uuid.UUID, depth: int):
            if depth > max_depth or current_id in visited:
                return
            visited.add(current_id)

            lineage_result = await self.db.execute(
                select(BatchLineage)
                .options(
                    selectinload(BatchLineage.parent_batch).selectinload(
                        TraceabilityBatch.farm
                    )
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
        self, batch_id: uuid.UUID, max_depth: int
    ) -> list[TraceChainNode]:
        visited: set[uuid.UUID] = set()
        result_nodes: list[TraceChainNode] = []

        async def _recurse(current_id: uuid.UUID, depth: int):
            if depth > max_depth or current_id in visited:
                return
            visited.add(current_id)

            lineage_result = await self.db.execute(
                select(BatchLineage)
                .options(
                    selectinload(BatchLineage.child_batch).selectinload(
                        TraceabilityBatch.farm
                    )
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
        self, batch_ids: set[uuid.UUID]
    ) -> list[TraceChainEvent]:
        result = await self.db.execute(
            select(TraceEvent)
            .options(selectinload(TraceEvent.location))
            .where(
                TraceEvent.organization_id == self.org_id,
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

    # ═══════════════════════════════════════════════════════════════
    # RECALL MANAGEMENT
    # ═══════════════════════════════════════════════════════════════

    async def create_recall(self, data: RecallCreate) -> TraceRecall:
        trace_start = datetime.now(timezone.utc)

        # Generate recall number
        count_result = await self.db.execute(
            select(func.count())
            .select_from(TraceRecall)
            .where(TraceRecall.organization_id == self.org_id)
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
            organization_id=self.org_id,
            initiated_by=self.user_id,
            initiated_at=trace_start,
            trace_started_at=trace_start,
        )
        self.db.add(recall)
        await self.db.flush()

        # Find affected batches based on scope
        affected_batches = await self._find_affected_batches(data)

        # For each trigger batch, also trace forward to find downstream products
        all_affected_ids = {b.id for b in affected_batches}
        if data.trigger_batch_id:
            forward = await self._trace_forward(data.trigger_batch_id, max_depth=20)
            for node in forward:
                if node.batch_id not in all_affected_ids:
                    batch_result = await self.db.execute(
                        select(TraceabilityBatch).where(
                            TraceabilityBatch.id == node.batch_id
                        )
                    )
                    batch = batch_result.scalar_one_or_none()
                    if batch:
                        affected_batches.append(batch)
                        all_affected_ids.add(batch.id)

        # Create recall-batch links and mark batches as recalled
        total_units = 0
        clients_set: set[uuid.UUID] = set()
        for batch in affected_batches:
            rb = RecallBatch(
                recall_id=recall.id,
                batch_id=batch.id,
                client_id=batch.client_id,
                units_in_batch=batch.quantity,
            )
            self.db.add(rb)
            total_units += batch.quantity
            batch.status = BatchStatus.RECALLED
            if batch.client_id:
                clients_set.add(batch.client_id)

        recall.batches_affected = len(affected_batches)
        recall.units_affected = total_units
        recall.clients_notified = len(clients_set)
        recall.trace_completed_at = datetime.now(timezone.utc)

        await self.db.flush()
        return recall

    async def _find_affected_batches(
        self, data: RecallCreate
    ) -> list[TraceabilityBatch]:
        stmt = select(TraceabilityBatch).where(
            TraceabilityBatch.organization_id == self.org_id,
            TraceabilityBatch.status != BatchStatus.RECALLED,
        )

        if data.scope.value == "batch" and data.trigger_batch_id:
            stmt = stmt.where(TraceabilityBatch.id == data.trigger_batch_id)
        elif data.scope.value == "product" and data.product_category:
            stmt = stmt.where(
                TraceabilityBatch.product_category == data.product_category
            )
        elif data.scope.value == "date_range":
            if data.date_from:
                stmt = stmt.where(TraceabilityBatch.date >= data.date_from)
            if data.date_to:
                stmt = stmt.where(TraceabilityBatch.date <= data.date_to)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_recalls(
        self,
        *,
        status_filter: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = select(TraceRecall).where(TraceRecall.organization_id == self.org_id)
        if status_filter:
            stmt = stmt.where(TraceRecall.status == status_filter)
        stmt = (
            stmt.order_by(TraceRecall.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_recall(self, recall_id: uuid.UUID) -> TraceRecall:
        result = await self.db.execute(
            select(TraceRecall).where(
                TraceRecall.id == recall_id,
                TraceRecall.organization_id == self.org_id,
            )
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError("Recall not found")
        return obj

    async def complete_recall(self, recall_id: uuid.UUID) -> dict:
        recall = await self.get_recall(recall_id)
        recall.status = RecallStatus.COMPLETED
        recall.completed_at = datetime.now(timezone.utc)
        await self.db.flush()
        return {"status": "completed", "recall_number": recall.recall_number}
