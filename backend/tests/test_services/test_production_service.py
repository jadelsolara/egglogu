"""Tests para ProductionService — Producción diaria con invalidación de caché."""

import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from src.schemas.production import DailyProductionCreate, DailyProductionUpdate
from src.services.production_service import ProductionService

pytestmark = pytest.mark.asyncio


@patch("src.services.production_service.invalidate_prefix", new_callable=AsyncMock)
async def test_create_production(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = ProductionService(db_session, user.organization_id, user.id)

    data = DailyProductionCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 1),
        total_eggs=4200,
        broken=10,
        small=500,
        medium=2000,
        large=1500,
        xl=200,
    )
    record = await svc.create_production(data)

    assert record.total_eggs == 4200
    assert record.organization_id == user.organization_id
    mock_cache.assert_called_once()


@patch("src.services.production_service.invalidate_prefix", new_callable=AsyncMock)
async def test_list_production(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = ProductionService(db_session, user.organization_id, user.id)

    for day in [1, 2, 3]:
        await svc.create_production(DailyProductionCreate(
            flock_id=sample_flock.id,
            date=date(2025, 7, day),
            total_eggs=4000 + day * 100,
        ))

    records = await svc.list_production()
    assert len(records) == 3


@patch("src.services.production_service.invalidate_prefix", new_callable=AsyncMock)
async def test_update_production(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = ProductionService(db_session, user.organization_id, user.id)

    record = await svc.create_production(DailyProductionCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 10),
        total_eggs=3000,
    ))

    updated = await svc.update_production(record.id, DailyProductionUpdate(total_eggs=3500))
    assert updated.total_eggs == 3500
    assert mock_cache.call_count == 2  # create + update


@patch("src.services.production_service.invalidate_prefix", new_callable=AsyncMock)
async def test_delete_production(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = ProductionService(db_session, user.organization_id, user.id)

    record = await svc.create_production(DailyProductionCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 15),
        total_eggs=2500,
    ))

    await svc.delete_production(record.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await svc.get_production(record.id)
