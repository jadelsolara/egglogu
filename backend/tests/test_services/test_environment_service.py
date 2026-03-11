"""Tests para EnvironmentService — Lecturas ambientales, IoT, clima."""

import uuid
from datetime import date, datetime, timezone

import pytest

from src.schemas.environment import (
    EnvironmentReadingCreate,
    EnvironmentReadingUpdate,
    IoTReadingCreate,
    WeatherCacheCreate,
)
from src.services.environment_service import EnvironmentService

pytestmark = pytest.mark.asyncio


async def test_create_environment(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    data = EnvironmentReadingCreate(
        date=date(2025, 7, 1),
        temp_c=28.5,
        humidity_pct=65.0,
        ammonia_ppm=15.0,
    )
    reading = await svc.create_environment(data)

    assert reading.temp_c == 28.5
    assert reading.humidity_pct == 65.0
    assert reading.organization_id == user.organization_id


async def test_list_environment(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    await svc.create_environment(EnvironmentReadingCreate(date=date(2025, 7, 1), temp_c=25.0))
    await svc.create_environment(EnvironmentReadingCreate(date=date(2025, 7, 2), temp_c=26.0))

    readings = await svc.list_environment()
    assert len(readings) == 2


async def test_update_environment(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    reading = await svc.create_environment(EnvironmentReadingCreate(
        date=date(2025, 7, 1), temp_c=22.0,
    ))
    updated = await svc.update_environment(
        reading.id, EnvironmentReadingUpdate(temp_c=24.5)
    )
    assert updated.temp_c == 24.5


async def test_delete_environment(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    reading = await svc.create_environment(EnvironmentReadingCreate(
        date=date(2025, 7, 1), temp_c=30.0,
    ))
    await svc.delete_environment(reading.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await svc.get_environment(reading.id)


async def test_create_iot(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    data = IoTReadingCreate(
        timestamp=datetime(2025, 7, 1, 10, 30, tzinfo=timezone.utc),
        sensor_type="temperature",
        value=27.3,
        unit="C",
    )
    reading = await svc.create_iot(data)
    assert reading.sensor_type == "temperature"
    assert reading.value == 27.3


async def test_list_iot(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    for i in range(3):
        await svc.create_iot(IoTReadingCreate(
            timestamp=datetime(2025, 7, 1, 10 + i, tzinfo=timezone.utc),
            sensor_type="humidity",
            value=60.0 + i,
            unit="%",
        ))

    readings = await svc.list_iot()
    assert len(readings) == 3


async def test_create_weather(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    data = WeatherCacheCreate(
        timestamp=datetime(2025, 7, 1, 12, 0, tzinfo=timezone.utc),
        temp_c=32.0,
        humidity=45.0,
        description="Soleado",
    )
    weather = await svc.create_weather(data)
    assert weather.temp_c == 32.0
    assert weather.description == "Soleado"


async def test_delete_weather(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = EnvironmentService(db_session, user.organization_id, user.id)

    weather = await svc.create_weather(WeatherCacheCreate(
        timestamp=datetime(2025, 7, 1, 12, 0, tzinfo=timezone.utc),
        temp_c=20.0,
    ))
    await svc.delete_weather(weather.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await svc.get_weather(weather.id)
