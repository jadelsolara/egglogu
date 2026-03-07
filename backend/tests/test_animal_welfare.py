"""Tests for /api/v1/welfare endpoints."""

import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.farm import Farm
from src.models.flock import Flock


PREFIX = "/api/v1/welfare"


@pytest.fixture
async def welfare_flock(db_session: AsyncSession, authenticated_user):
    farm = Farm(name="Welfare Farm", organization_id=authenticated_user["org"].id)
    db_session.add(farm)
    await db_session.flush()
    flock = Flock(
        name="Welfare Flock",
        organization_id=authenticated_user["org"].id,
        farm_id=farm.id,
        breed="Hy-Line W-36",
        initial_count=5000,
        current_count=5000,
        start_date=date(2025, 6, 1),
    )
    db_session.add(flock)
    await db_session.flush()
    return flock


@pytest.mark.asyncio
class TestListWelfare:
    async def test_list_empty(self, client: AsyncClient, authenticated_user):
        resp = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert resp.status_code == 200

    async def test_list_unauth(self, client: AsyncClient):
        resp = await client.get(PREFIX)
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestWelfareStats:
    async def test_stats(self, client: AsyncClient, authenticated_user):
        resp = await client.get(f"{PREFIX}/stats", headers=authenticated_user["headers"])
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestCreateWelfare:
    async def test_create_assessment(self, client: AsyncClient, authenticated_user, welfare_flock):
        resp = await client.post(
            PREFIX,
            json={
                "flock_id": str(welfare_flock.id),
                "date": "2025-10-01",
                "plumage_score": 4,
                "mobility_score": 4,
                "behavior_score": 3,
                "mortality_today": 2,
                "notes": "Good overall welfare",
            },
            headers=authenticated_user["headers"],
        )
        assert resp.status_code in (200, 201)
        return resp.json()


@pytest.mark.asyncio
class TestGetWelfare:
    async def test_get_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestDeleteWelfare:
    async def test_delete_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.delete(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404
