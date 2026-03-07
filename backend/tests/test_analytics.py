"""Tests for /api/v1/analytics endpoints.

Note: Several analytics endpoints query PostgreSQL materialized views
(mv_org_production_trends, mv_weekly_kpi, mv_monthly_costs, mv_daily_production_summary)
which don't exist in the SQLite test database. Those are tested via integration tests
against a real PostgreSQL instance. Here we test the endpoints that work with regular
ORM queries (economics) and auth/access control for all endpoints.
"""

import uuid
from datetime import date, datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.farm import Farm
from src.models.flock import Flock


PREFIX = "/api/v1/analytics"


@pytest.fixture
async def analytics_flock(db_session: AsyncSession, authenticated_user):
    farm = Farm(name="Analytics Farm", organization_id=authenticated_user["org"].id)
    db_session.add(farm)
    await db_session.flush()
    flock = Flock(
        name="Analytics Flock",
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
class TestEconomics:
    async def test_economics_ok(self, client: AsyncClient, authenticated_user, analytics_flock):
        resp = await client.get(f"{PREFIX}/economics", headers=authenticated_user["headers"])
        assert resp.status_code == 200

    async def test_economics_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/economics")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestAnalyticsAuth:
    """Verify that analytics endpoints require authentication."""

    async def test_trends_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/production/trends")
        assert resp.status_code in (401, 403)

    async def test_daily_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/production/daily")
        assert resp.status_code in (401, 403)

    async def test_weekly_kpi_unauth(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/flock/{fake_id}/weekly-kpi")
        assert resp.status_code in (401, 403)

    async def test_fcr_unauth(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/flock/{fake_id}/fcr")
        assert resp.status_code in (401, 403)

    async def test_costs_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/costs/monthly")
        assert resp.status_code in (401, 403)

    async def test_refresh_unauth(self, client: AsyncClient):
        resp = await client.post(f"{PREFIX}/refresh")
        assert resp.status_code in (401, 403)
