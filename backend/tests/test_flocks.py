"""Tests for /api/v1/flocks CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/flocks"
FARM_PREFIX = "/api/v1/farms"


async def _create_farm(client: AsyncClient, headers: dict) -> str:
    """Helper: create a farm and return its id."""
    resp = await client.post(FARM_PREFIX, json={"name": "Test Farm"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
class TestListFlocks:

    async def test_list_flocks_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_flocks_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        farm_id = await _create_farm(client, headers)
        await client.post(PREFIX, json={
            "farm_id": farm_id, "name": "Flock A",
            "initial_count": 1000, "current_count": 1000, "start_date": "2025-01-01"
        }, headers=headers)
        await client.post(PREFIX, json={
            "farm_id": farm_id, "name": "Flock B",
            "initial_count": 500, "current_count": 500, "start_date": "2025-02-01"
        }, headers=headers)

        response = await client.get(PREFIX, headers=headers)
        assert response.status_code == 200
        flocks = response.json()
        assert len(flocks) == 2
        names = {f["name"] for f in flocks}
        assert names == {"Flock A", "Flock B"}

    async def test_list_flocks_unauthenticated(self, client: AsyncClient):
        response = await client.get(PREFIX)
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateFlock:

    async def test_create_flock_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        farm_id = await _create_farm(client, headers)
        payload = {
            "farm_id": farm_id, "name": "Test Flock",
            "initial_count": 1000, "current_count": 1000, "start_date": "2025-01-01"
        }
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Flock"
        assert "id" in data

    async def test_create_flock_unauthenticated(self, client: AsyncClient):
        response = await client.post(PREFIX, json={
            "farm_id": str(uuid.uuid4()), "name": "No Auth",
            "initial_count": 100, "current_count": 100, "start_date": "2025-01-01"
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeleteFlock:

    async def test_delete_flock_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        farm_id = await _create_farm(client, headers)
        create_resp = await client.post(PREFIX, json={
            "farm_id": farm_id, "name": "Doomed Flock",
            "initial_count": 100, "current_count": 100, "start_date": "2025-01-01"
        }, headers=headers)
        flock_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/{flock_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/{flock_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_flock_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
