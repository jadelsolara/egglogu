"""Tests para FlockService — CRUD de lotes de aves."""

import uuid
from datetime import date

import pytest

from src.schemas.flock import FlockCreate, FlockUpdate
from src.services.flock_service import FlockService

pytestmark = pytest.mark.asyncio


async def test_create_flock(db_session, authenticated_user, sample_farm):
    user = authenticated_user["user"]
    svc = FlockService(db_session, user.organization_id, user.id)

    data = FlockCreate(
        farm_id=sample_farm.id,
        name="Lote Alpha",
        initial_count=5000,
        current_count=5000,
        start_date=date(2025, 6, 1),
        breed="Hy-Line W-36",
    )
    flock = await svc.create_flock(data)

    assert flock.name == "Lote Alpha"
    assert flock.initial_count == 5000
    assert flock.organization_id == user.organization_id


async def test_list_flocks(db_session, authenticated_user, sample_farm):
    user = authenticated_user["user"]
    svc = FlockService(db_session, user.organization_id, user.id)

    for name in ["Lote A", "Lote B"]:
        await svc.create_flock(FlockCreate(
            farm_id=sample_farm.id,
            name=name,
            initial_count=1000,
            current_count=1000,
            start_date=date(2025, 1, 1),
        ))

    flocks = await svc.list_flocks()
    assert len(flocks) == 2


async def test_get_flock_not_found(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FlockService(db_session, user.organization_id, user.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await svc.get_flock(uuid.uuid4())
    assert exc_info.value.status_code == 404


async def test_update_flock(db_session, authenticated_user, sample_farm):
    user = authenticated_user["user"]
    svc = FlockService(db_session, user.organization_id, user.id)

    flock = await svc.create_flock(FlockCreate(
        farm_id=sample_farm.id,
        name="Lote Original",
        initial_count=3000,
        current_count=3000,
        start_date=date(2025, 3, 1),
    ))

    updated = await svc.update_flock(flock.id, FlockUpdate(current_count=2800))
    assert updated.current_count == 2800
    assert updated.name == "Lote Original"


async def test_delete_flock(db_session, authenticated_user, sample_farm):
    user = authenticated_user["user"]
    svc = FlockService(db_session, user.organization_id, user.id)

    flock = await svc.create_flock(FlockCreate(
        farm_id=sample_farm.id,
        name="Lote Temporal",
        initial_count=100,
        current_count=100,
        start_date=date(2025, 1, 1),
    ))
    await svc.delete_flock(flock.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await svc.get_flock(flock.id)
