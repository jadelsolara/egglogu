"""HealthService — Vacunas, medicamentos, brotes y estrés."""

import math
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from src.core.cache import invalidate_prefix
from src.models.farm import Farm
from src.models.health import Medication, Outbreak, StressEvent, Vaccine
from src.models.outbreak_alert import OutbreakAlert
from src.services.base import BaseService


class HealthService(BaseService):

    async def _invalidate(self) -> None:
        await invalidate_prefix(f"economics:{self.org_id}")

    # ── Vacunas ──────────────────────────────────────────────────────

    async def list_vaccines(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Vaccine, page=page, size=size)

    async def get_vaccine(self, item_id: uuid.UUID) -> Vaccine:
        return await self._get(Vaccine, item_id, error_msg="Vaccine not found")

    async def create_vaccine(self, data) -> Vaccine:
        item = await self._create(Vaccine, data)
        await self._invalidate()
        return item

    async def update_vaccine(self, item_id: uuid.UUID, data) -> Vaccine:
        item = await self._update(
            Vaccine, item_id, data, error_msg="Vaccine not found"
        )
        await self._invalidate()
        return item

    async def delete_vaccine(self, item_id: uuid.UUID) -> None:
        await self._delete(Vaccine, item_id, error_msg="Vaccine not found")
        await self._invalidate()

    # ── Medicamentos ─────────────────────────────────────────────────

    async def list_medications(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Medication, page=page, size=size)

    async def get_medication(self, item_id: uuid.UUID) -> Medication:
        return await self._get(Medication, item_id, error_msg="Medication not found")

    async def create_medication(self, data) -> Medication:
        item = await self._create(Medication, data)
        await self._invalidate()
        return item

    async def update_medication(self, item_id: uuid.UUID, data) -> Medication:
        item = await self._update(
            Medication, item_id, data, error_msg="Medication not found"
        )
        await self._invalidate()
        return item

    async def delete_medication(self, item_id: uuid.UUID) -> None:
        await self._delete(Medication, item_id, error_msg="Medication not found")
        await self._invalidate()

    # ── Brotes ───────────────────────────────────────────────────────

    async def list_outbreaks(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Outbreak, page=page, size=size)

    async def get_outbreak(self, item_id: uuid.UUID) -> Outbreak:
        return await self._get(Outbreak, item_id, error_msg="Outbreak not found")

    async def create_outbreak(self, data) -> Outbreak:
        return await self._create(Outbreak, data)

    async def update_outbreak(self, item_id: uuid.UUID, data) -> Outbreak:
        return await self._update(
            Outbreak, item_id, data, error_msg="Outbreak not found"
        )

    async def delete_outbreak(self, item_id: uuid.UUID) -> None:
        await self._delete(Outbreak, item_id, error_msg="Outbreak not found")

    # ── Eventos de estrés ────────────────────────────────────────────

    async def list_stress_events(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(StressEvent, page=page, size=size)

    async def get_stress_event(self, item_id: uuid.UUID) -> StressEvent:
        return await self._get(
            StressEvent, item_id, error_msg="Stress event not found"
        )

    async def create_stress_event(self, data) -> StressEvent:
        return await self._create(StressEvent, data)

    async def update_stress_event(self, item_id: uuid.UUID, data) -> StressEvent:
        return await self._update(
            StressEvent, item_id, data, error_msg="Stress event not found"
        )

    async def delete_stress_event(self, item_id: uuid.UUID) -> None:
        await self._delete(StressEvent, item_id, error_msg="Stress event not found")

    # ── Alertas de brotes (lógica de negocio: geolocalización) ──────

    @staticmethod
    def _haversine_km(
        lat1: float, lng1: float, lat2: float, lng2: float
    ) -> float:
        """Distancia Haversine en km entre dos puntos lat/lng."""
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlng / 2) ** 2
        )
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    async def get_outbreak_alerts(self) -> list[dict]:
        """Alertas activas dentro del radio de las granjas del usuario."""
        farms_result = await self.db.execute(
            select(Farm).where(
                Farm.organization_id == self.org_id,
                Farm.lat.is_not(None),
                Farm.lng.is_not(None),
            )
        )
        farms = farms_result.scalars().all()
        if not farms:
            return []

        now = datetime.now(timezone.utc)
        alerts_result = await self.db.execute(
            select(OutbreakAlert).where(OutbreakAlert.is_active.is_(True))
        )
        alerts = alerts_result.scalars().all()

        result = []
        for alert in alerts:
            if alert.expires_at and alert.expires_at < now:
                continue

            min_dist = float("inf")
            for farm in farms:
                dist = self._haversine_km(
                    alert.epicenter_lat, alert.epicenter_lng,
                    farm.lat, farm.lng,
                )
                if dist < min_dist:
                    min_dist = dist

            if min_dist <= alert.radius_km:
                result.append({
                    "id": str(alert.id),
                    "title": alert.title,
                    "disease": alert.disease,
                    "severity": alert.severity.value,
                    "transmission": alert.transmission.value,
                    "species_affected": alert.species_affected,
                    "epicenter_lat": alert.epicenter_lat,
                    "epicenter_lng": alert.epicenter_lng,
                    "radius_km": alert.radius_km,
                    "region_name": alert.region_name,
                    "detected_date": alert.detected_date.isoformat(),
                    "description": alert.description,
                    "contingency_protocol": alert.contingency_protocol,
                    "source_url": alert.source_url,
                    "confirmed_cases": alert.confirmed_cases,
                    "deaths_reported": alert.deaths_reported,
                    "spread_speed_km_day": alert.spread_speed_km_day,
                    "spread_direction": alert.spread_direction,
                    "distance_km": round(min_dist, 1),
                    "created_at": alert.created_at.isoformat(),
                })

        severity_order = {"critical": 0, "high": 1, "moderate": 2, "low": 3}
        result.sort(
            key=lambda a: (severity_order.get(a["severity"], 9), a["distance_km"])
        )
        return result
