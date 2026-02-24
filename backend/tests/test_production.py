"""Tests for /api/v1/production CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/production"
FARM_PREFIX = "/api/v1/farms"
FLOCK_PREFIX = "/api/v1/flocks"


async def _create_farm_and_flock(client: AsyncClient, headers: dict) -> tuple[str, str]:
    """Helper: create a farm + flock and return (farm_id, flock_id)."""
    farm_resp = await client.post(FARM_PREFIX, json={"name": "Prod Farm"}, headers=headers)
    assert farm_resp.status_code == 201
    farm_id = farm_resp.json()["id"]

    flock_resp = await client.post(FLOCK_PREFIX, json={
        "farm_id": farm_id, "name": "Prod Flock",
        "initial_count": 1000, "current_count": 1000, "start_date": "2025-01-01"
    }, headers=headers)
    assert flock_resp.status_code == 201
    flock_id = flock_resp.json()["id"]
    return farm_id, flock_id


@pytest.mark.asyncio
class TestListProduction:

    async def test_list_production_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_production_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        await client.post(PREFIX, json={
            "flock_id": flock_id, "date": "2025-01-15", "total_eggs": 500
        }, headers=headers)
        await client.post(PREFIX, json={
            "flock_id": flock_id, "date": "2025-01-16", "total_eggs": 600
        }, headers=headers)

        response = await client.get(PREFIX, headers=headers)
        assert response.status_code == 200
        records = response.json()
        assert len(records) == 2

    async def test_list_production_unauthenticated(self, client: AsyncClient):
        response = await client.get(PREFIX)
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateProduction:

    async def test_create_production_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        payload = {"flock_id": flock_id, "date": "2025-01-15", "total_eggs": 500}
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["total_eggs"] == 500
        assert "id" in data

    async def test_create_production_unauthenticated(self, client: AsyncClient):
        response = await client.post(PREFIX, json={
            "flock_id": str(uuid.uuid4()), "date": "2025-01-15", "total_eggs": 500
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteProduction:

    async def test_delete_production_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        create_resp = await client.post(PREFIX, json={
            "flock_id": flock_id, "date": "2025-01-15", "total_eggs": 500
        }, headers=headers)
        record_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/{record_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/{record_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_production_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
