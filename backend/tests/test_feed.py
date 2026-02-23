"""Tests for /api/v1/feed (purchases + consumption) CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/feed"
FARM_PREFIX = "/api/v1/farms"
FLOCK_PREFIX = "/api/v1/flocks"


async def _create_farm_and_flock(client: AsyncClient, headers: dict) -> tuple[str, str]:
    """Helper: create a farm + flock and return (farm_id, flock_id)."""
    farm_resp = await client.post(FARM_PREFIX, json={"name": "Feed Farm"}, headers=headers)
    assert farm_resp.status_code == 201
    farm_id = farm_resp.json()["id"]

    flock_resp = await client.post(FLOCK_PREFIX, json={
        "farm_id": farm_id, "name": "Feed Flock",
        "initial_count": 1000, "current_count": 1000, "start_date": "2025-01-01"
    }, headers=headers)
    assert flock_resp.status_code == 201
    flock_id = flock_resp.json()["id"]
    return farm_id, flock_id


# ── Purchases ──


@pytest.mark.asyncio
class TestListPurchases:

    async def test_list_purchases_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/purchases", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_purchases_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/purchases", json={
            "date": "2025-01-01", "kg": 100, "price_per_kg": 1.5, "total_cost": 150
        }, headers=headers)
        await client.post(f"{PREFIX}/purchases", json={
            "date": "2025-01-02", "kg": 200, "price_per_kg": 1.4, "total_cost": 280
        }, headers=headers)

        response = await client.get(f"{PREFIX}/purchases", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_purchases_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/purchases")
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreatePurchase:

    async def test_create_purchase_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"date": "2025-01-01", "kg": 100, "price_per_kg": 1.5, "total_cost": 150}
        response = await client.post(f"{PREFIX}/purchases", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_purchase_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/purchases", json={
            "date": "2025-01-01", "kg": 100, "price_per_kg": 1.5, "total_cost": 150
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeletePurchase:

    async def test_delete_purchase_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/purchases", json={
            "date": "2025-01-01", "kg": 100, "price_per_kg": 1.5, "total_cost": 150
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/purchases/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/purchases/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_purchase_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/purchases/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Consumption ──


@pytest.mark.asyncio
class TestListConsumption:

    async def test_list_consumption_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/consumption", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_consumption_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        await client.post(f"{PREFIX}/consumption", json={
            "flock_id": flock_id, "date": "2025-01-01", "feed_kg": 50.0
        }, headers=headers)
        await client.post(f"{PREFIX}/consumption", json={
            "flock_id": flock_id, "date": "2025-01-02", "feed_kg": 55.0
        }, headers=headers)

        response = await client.get(f"{PREFIX}/consumption", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_consumption_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/consumption")
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateConsumption:

    async def test_create_consumption_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        payload = {"flock_id": flock_id, "date": "2025-01-01", "feed_kg": 50.0}
        response = await client.post(f"{PREFIX}/consumption", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_consumption_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/consumption", json={
            "flock_id": str(uuid.uuid4()), "date": "2025-01-01", "feed_kg": 50.0
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeleteConsumption:

    async def test_delete_consumption_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        _, flock_id = await _create_farm_and_flock(client, headers)
        create_resp = await client.post(f"{PREFIX}/consumption", json={
            "flock_id": flock_id, "date": "2025-01-01", "feed_kg": 50.0
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/consumption/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/consumption/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_consumption_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/consumption/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
