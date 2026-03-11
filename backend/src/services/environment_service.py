"""EnvironmentService — Lecturas ambientales, IoT, clima."""

import uuid

from src.models.environment import EnvironmentReading, IoTReading, WeatherCache
from src.services.base import BaseService


class EnvironmentService(BaseService):
    # ── Lecturas ambientales ─────────────────────────────────────────

    async def list_environment(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(EnvironmentReading, page=page, size=size)

    async def get_environment(self, item_id: uuid.UUID) -> EnvironmentReading:
        return await self._get(
            EnvironmentReading, item_id, error_msg="Environment reading not found"
        )

    async def create_environment(self, data) -> EnvironmentReading:
        return await self._create(EnvironmentReading, data)

    async def update_environment(self, item_id: uuid.UUID, data) -> EnvironmentReading:
        return await self._update(
            EnvironmentReading,
            item_id,
            data,
            error_msg="Environment reading not found",
        )

    async def delete_environment(self, item_id: uuid.UUID) -> None:
        await self._delete(
            EnvironmentReading, item_id, error_msg="Environment reading not found"
        )

    # ── IoT ──────────────────────────────────────────────────────────

    async def list_iot(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(IoTReading, page=page, size=size)

    async def get_iot(self, item_id: uuid.UUID) -> IoTReading:
        return await self._get(IoTReading, item_id, error_msg="IoT reading not found")

    async def create_iot(self, data) -> IoTReading:
        return await self._create(IoTReading, data)

    async def update_iot(self, item_id: uuid.UUID, data) -> IoTReading:
        return await self._update(
            IoTReading, item_id, data, error_msg="IoT reading not found"
        )

    async def delete_iot(self, item_id: uuid.UUID) -> None:
        await self._delete(IoTReading, item_id, error_msg="IoT reading not found")

    # ── Clima ────────────────────────────────────────────────────────

    async def list_weather(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(WeatherCache, page=page, size=size)

    async def get_weather(self, item_id: uuid.UUID) -> WeatherCache:
        return await self._get(
            WeatherCache, item_id, error_msg="Weather cache not found"
        )

    async def create_weather(self, data) -> WeatherCache:
        return await self._create(WeatherCache, data)

    async def update_weather(self, item_id: uuid.UUID, data) -> WeatherCache:
        return await self._update(
            WeatherCache, item_id, data, error_msg="Weather cache not found"
        )

    async def delete_weather(self, item_id: uuid.UUID) -> None:
        await self._delete(WeatherCache, item_id, error_msg="Weather cache not found")
