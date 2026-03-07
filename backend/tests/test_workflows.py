"""Tests for /api/v1/workflows endpoints."""

import uuid
from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.farm import Farm


PREFIX = "/api/v1/workflows"


@pytest.fixture
async def workflow_farm(db_session: AsyncSession, authenticated_user):
    farm = Farm(name="Workflow Farm", organization_id=authenticated_user["org"].id)
    db_session.add(farm)
    await db_session.flush()
    return farm


@pytest.mark.asyncio
class TestPresets:
    async def test_list_presets(self, client: AsyncClient, authenticated_user):
        resp = await client.get(f"{PREFIX}/presets", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_presets_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/presets")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestListRules:
    async def test_list_rules_requires_farm(self, client: AsyncClient, authenticated_user, workflow_farm):
        resp = await client.get(
            f"{PREFIX}/rules",
            params={"farm_id": str(workflow_farm.id)},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestCreateRule:
    async def test_create_rule(self, client: AsyncClient, authenticated_user, workflow_farm):
        resp = await client.post(
            f"{PREFIX}/rules",
            json={
                "farm_id": str(workflow_farm.id),
                "name": "Low production alert",
                "trigger_type": "threshold",
                "conditions": {"threshold": 10},
                "actions": {"type": "notification", "message": "Production dropped"},
            },
            headers=authenticated_user["headers"],
        )
        assert resp.status_code in (200, 201)
        return resp.json()


@pytest.mark.asyncio
class TestRuleDetail:
    async def test_get_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/rules/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestRuleDelete:
    async def test_delete_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.delete(f"{PREFIX}/rules/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestEvaluateRules:
    async def test_evaluate(self, client: AsyncClient, authenticated_user, workflow_farm):
        resp = await client.post(
            f"{PREFIX}/evaluate",
            params={"farm_id": str(workflow_farm.id)},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestExecutions:
    async def test_list_executions(self, client: AsyncClient, authenticated_user, workflow_farm):
        resp = await client.get(
            f"{PREFIX}/executions",
            params={"farm_id": str(workflow_farm.id)},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 200
