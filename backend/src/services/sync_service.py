"""SyncService — Lógica de sincronización delta para PWA offline-first.

Maneja el upsert de cambios del cliente y la obtención de cambios
del servidor desde un timestamp dado.
"""

import asyncio
import logging
import uuid as _sync_uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from src.services.base import BaseService
from src.models import (
    Farm,
    Flock,
    DailyProduction,
    Vaccine,
    Medication,
    Outbreak,
    StressEvent,
    FeedPurchase,
    FeedConsumption,
    Client,
    Income,
    Expense,
    Receivable,
    EnvironmentReading,
    IoTReading,
    WeatherCache,
    ChecklistItem,
    LogbookEntry,
    Personnel,
    BiosecurityVisitor,
    BiosecurityZone,
    PestSighting,
    BiosecurityProtocol,
    TraceabilityBatch,
    ProductionPlan,
)

logger = logging.getLogger("egglogu.sync")

MODEL_MAP = {
    "farms": Farm,
    "flocks": Flock,
    "production": DailyProduction,
    "vaccines": Vaccine,
    "medications": Medication,
    "outbreaks": Outbreak,
    "stress_events": StressEvent,
    "feed_purchases": FeedPurchase,
    "feed_consumption": FeedConsumption,
    "clients": Client,
    "incomes": Income,
    "expenses": Expense,
    "receivables": Receivable,
    "environment_readings": EnvironmentReading,
    "iot_readings": IoTReading,
    "weather_cache": WeatherCache,
    "checklist_items": ChecklistItem,
    "logbook_entries": LogbookEntry,
    "personnel": Personnel,
    "biosecurity_visitors": BiosecurityVisitor,
    "biosecurity_zones": BiosecurityZone,
    "biosecurity_pest_sightings": PestSighting,
    "biosecurity_protocols": BiosecurityProtocol,
    "traceability_batches": TraceabilityBatch,
    "production_plans": ProductionPlan,
}


class SyncService(BaseService):
    """Servicio de sincronización delta entre cliente y servidor."""

    async def sync(
        self,
        data: dict[str, list[dict[str, Any]]],
        last_synced_at: datetime | None,
    ) -> dict[str, Any]:
        """Ejecuta el ciclo completo de sincronización.

        Fase 1: Upsert de cambios del cliente (batch por entidad).
        Fase 2: Retorna cambios del servidor desde ``last_synced_at``.

        Returns:
            Diccionario con synced, conflicts, server_changes, server_now,
            sync_cursor y conflict_count.
        """
        server_now = datetime.now(timezone.utc)
        synced = 0
        conflicts: list[str] = []

        logger.info(
            "Sync request from user=%s org=%s entities=%d last_synced=%s",
            self.user_id,
            self.org_id,
            len(data),
            last_synced_at,
        )

        # ── Fase 1: Upsert de cambios del cliente ──
        for entity_key, records in data.items():
            upsert_result = await self._upsert_entity(entity_key, records)
            synced += upsert_result["synced"]
            conflicts.extend(upsert_result["conflicts"])

        await self.db.flush()

        # ── Fase 2: Cambios del servidor ──
        since = last_synced_at or datetime.min.replace(tzinfo=timezone.utc)
        server_changes = await self._fetch_server_changes(since)

        # Cursor: el updated_at más reciente de todos los cambios retornados
        max_cursor = self._compute_cursor(server_changes)

        logger.info(
            "Sync complete: synced=%d conflicts=%d changes_returned=%d cursor=%s",
            synced,
            len(conflicts),
            sum(len(v) for v in server_changes.values()),
            max_cursor,
        )

        return {
            "synced": synced,
            "conflicts": conflicts,
            "conflict_count": len(conflicts),
            "server_changes": server_changes,
            "server_now": server_now.isoformat(),
            "sync_cursor": max_cursor.isoformat() if max_cursor else None,
        }

    # ── Métodos internos ─────────────────────────────────────────────

    async def _upsert_entity(
        self, entity_key: str, records: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Upsert de registros de una entidad específica."""
        result = {"synced": 0, "conflicts": []}
        model_cls = MODEL_MAP.get(entity_key)
        if not model_cls:
            result["conflicts"].append(f"Unknown entity: {entity_key}")
            logger.warning("Unknown sync entity: %s", entity_key)
            return result

        valid_cols = {c.key for c in model_cls.__table__.columns}

        updates_by_id: dict[str, dict[str, Any]] = {}
        inserts: list[dict[str, Any]] = []

        for record_data in records:
            record_id = record_data.pop("id", None)
            record_data["organization_id"] = self.org_id
            filtered = {k: v for k, v in record_data.items() if k in valid_cols}

            if record_id:
                updates_by_id[str(record_id)] = {
                    "_raw": filtered,
                    "_client_updated": record_data.get("updated_at"),
                }
            else:
                filtered.pop("id", None)
                inserts.append(filtered)

        # Batch fetch de registros existentes para actualización
        if updates_by_id:
            try:
                id_uuids = [_sync_uuid.UUID(rid) for rid in updates_by_id.keys()]
                fetch_filters = [
                    model_cls.id.in_(id_uuids),
                    model_cls.organization_id == self.org_id,
                ]
                if hasattr(model_cls, "deleted_at"):
                    fetch_filters.append(model_cls.deleted_at.is_(None))
                result_existing = await self.db.execute(
                    select(model_cls).where(*fetch_filters)
                )
                existing_map = {
                    str(obj.id): obj for obj in result_existing.scalars().all()
                }

                for rid, meta in updates_by_id.items():
                    existing = existing_map.get(rid)
                    if existing:
                        client_updated = meta["_client_updated"]
                        if client_updated and existing.updated_at:
                            if isinstance(client_updated, str):
                                client_updated = datetime.fromisoformat(client_updated)
                            if client_updated <= existing.updated_at:
                                result["conflicts"].append(
                                    f"{entity_key}/{rid}: server is newer"
                                )
                                continue
                        for k, v in meta["_raw"].items():
                            if k not in ("id", "organization_id", "created_at"):
                                setattr(existing, k, v)
                        result["synced"] += 1
                    else:
                        data = meta["_raw"]
                        data.pop("id", None)
                        inserts.append(data)
            except Exception as e:
                result["conflicts"].append(f"{entity_key}: batch update error — {e}")
                logger.error("Sync batch update error on %s: %s", entity_key, e)

        # Inserts nuevos en batch
        for ins_data in inserts:
            try:
                obj = model_cls(**ins_data)
                self.db.add(obj)
                result["synced"] += 1
            except IntegrityError as e:
                await self.db.rollback()
                result["conflicts"].append(f"{entity_key}: FK violation — {e.orig}")
                logger.error("Sync IntegrityError on %s: %s", entity_key, e.orig)
            except Exception as e:
                result["conflicts"].append(f"{entity_key}: {e}")
                logger.error("Sync error on %s: %s", entity_key, e)

        return result

    async def _fetch_server_changes(
        self, since: datetime
    ) -> dict[str, list[dict[str, Any]]]:
        """Obtiene todos los registros modificados desde ``since``."""

        async def _fetch_entity(
            entity_key: str, model_cls: type
        ) -> tuple[str, list[dict[str, Any]]]:
            if not hasattr(model_cls, "updated_at") or not hasattr(
                model_cls, "organization_id"
            ):
                return entity_key, []
            filters = [
                model_cls.organization_id == self.org_id,
                model_cls.updated_at > since,
            ]
            if hasattr(model_cls, "deleted_at"):
                filters.append(model_cls.deleted_at.is_(None))
            stmt = (
                select(model_cls)
                .where(*filters)
                .order_by(model_cls.updated_at)
                .limit(500)
            )
            res = await self.db.execute(stmt)
            rows = res.scalars().all()
            return entity_key, [_row_to_dict(r) for r in rows]

        results = await asyncio.gather(
            *[_fetch_entity(k, m) for k, m in MODEL_MAP.items()]
        )
        server_changes: dict[str, list[dict[str, Any]]] = {}
        for entity_key, rows in results:
            if rows:
                server_changes[entity_key] = rows
        return server_changes

    @staticmethod
    def _compute_cursor(
        server_changes: dict[str, list[dict[str, Any]]],
    ) -> datetime | None:
        """Calcula el cursor de sincronización (máximo updated_at)."""
        max_cursor: datetime | None = None
        for entity_rows in server_changes.values():
            for row_dict in entity_rows:
                ts = row_dict.get("updated_at")
                if ts:
                    if isinstance(ts, str):
                        ts = datetime.fromisoformat(ts)
                    if max_cursor is None or ts > max_cursor:
                        max_cursor = ts
        return max_cursor


def _row_to_dict(obj: Any) -> dict[str, Any]:
    """Convierte una instancia de modelo SQLAlchemy a dict JSON-safe."""
    result = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.key, None)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif hasattr(val, "hex"):  # UUID
            val = str(val)
        result[col.key] = val
    return result
