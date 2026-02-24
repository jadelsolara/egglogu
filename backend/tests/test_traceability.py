"""Tests for /api/v1/traceability CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/traceability"
FARM_PREFIX = "/api/v1/farms"
FLOCK_PREFIX = "/api/v1/flocks"


async def _create_farm_and_flock(client: AsyncClient, headers: dict) -> tuple[str, str]:
    """Helper: create a farm + flock and return (farm_id, flock_id)."""
    farm_resp = await client.post(FARM_PREFIX, json={"name": "Trace Farm"}, headers=headers)
    assert farm_resp.status_code == 201
    farm_id = farm_resp.json()["id"]

    flock_resp = await client.post(FLOCK_PREFIX, json={
        "farm_id": farm_id, "name": "Trace Flock",
        "initial_count": 1000, "current_count": 1000, "start_date": "2025-01-01"
    }, headers=headers)
    assert flock_resp.status_code == 201
    flock_id = flock_resp.json()["id"]
    return farm_id, flock_id


@pytest.mark.asyncio
class TestListBatches:

    async def test_list_batches_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/batches", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_batches_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        await client.post(f"{PREFIX}/batches", json={
            "date": "2025-01-01", "flock_id": flock_id, "box_count": 10, "eggs_per_box": 30
        }, headers=headers)
        await client.post(f"{PREFIX}/batches", json={
            "date": "2025-01-02", "flock_id": flock_id, "box_count": 15, "eggs_per_box": 30
        }, headers=headers)

        response = await client.get(f"{PREFIX}/batches", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_batches_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/batches")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateBatch:

    async def test_create_batch_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        payload = {"date": "2025-01-01", "flock_id": flock_id, "box_count": 10, "eggs_per_box": 30}
        response = await client.post(f"{PREFIX}/batches", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "batch_code" in data

    async def test_create_batch_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/batches", json={
            "date": "2025-01-01", "flock_id": str(uuid.uuid4()),
            "box_count": 10, "eggs_per_box": 30
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteBatch:

    async def test_delete_batch_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        create_resp = await client.post(f"{PREFIX}/batches", json={
            "date": "2025-01-01", "flock_id": flock_id, "box_count": 10, "eggs_per_box": 30
        }, headers=headers)
        batch_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/batches/{batch_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/batches/{batch_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_batch_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/batches/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
