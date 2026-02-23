"""Tests for /api/v1/farms CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/farms"


@pytest.mark.asyncio
class TestListFarms:

    async def test_list_farms_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_farms_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        # Create two farms
        await client.post(PREFIX, json={"name": "Farm Alpha"}, headers=headers)
        await client.post(PREFIX, json={"name": "Farm Beta"}, headers=headers)

        response = await client.get(PREFIX, headers=headers)
        assert response.status_code == 200
        farms = response.json()
        assert len(farms) == 2
        names = {f["name"] for f in farms}
        assert names == {"Farm Alpha", "Farm Beta"}

    async def test_list_farms_unauthenticated(self, client: AsyncClient):
        response = await client.get(PREFIX)
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateFarm:

    async def test_create_farm_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"name": "Mi Granja"}
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Mi Granja"
        assert data["lat"] is None
        assert data["lng"] is None
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_farm_full(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {
            "name": "Full Farm",
            "lat": 19.4326,
            "lng": -99.1332,
            "owm_api_key": "test-key",
            "mqtt_broker": "mqtt://broker.local",
            "mqtt_user": "admin",
            "mqtt_pass": "secret",
        }
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Full Farm"
        assert data["lat"] == pytest.approx(19.4326)
        assert data["lng"] == pytest.approx(-99.1332)
        assert data["owm_api_key"] == "test-key"
        assert data["mqtt_broker"] == "mqtt://broker.local"

    async def test_create_farm_unauthenticated(self, client: AsyncClient):
        response = await client.post(PREFIX, json={"name": "No Auth"})
        assert response.status_code == 403


@pytest.mark.asyncio
class TestGetFarm:

    async def test_get_farm_by_id(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        # Create
        create_resp = await client.post(
            PREFIX, json={"name": "Retrieval Farm"}, headers=headers
        )
        farm_id = create_resp.json()["id"]

        # Get
        response = await client.get(f"{PREFIX}/{farm_id}", headers=headers)
        assert response.status_code == 200
        assert response.json()["name"] == "Retrieval Farm"
        assert response.json()["id"] == farm_id

    async def test_get_nonexistent_farm(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.get(
            f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404

    async def test_get_farm_invalid_uuid(self, client: AsyncClient, authenticated_user):
        response = await client.get(
            f"{PREFIX}/not-a-uuid", headers=authenticated_user["headers"]
        )
        assert response.status_code == 422


@pytest.mark.asyncio
class TestUpdateFarm:

    async def test_update_farm_name(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(
            PREFIX, json={"name": "Old Name"}, headers=headers
        )
        farm_id = create_resp.json()["id"]

        response = await client.put(
            f"{PREFIX}/{farm_id}",
            json={"name": "New Name"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "New Name"
        assert response.json()["id"] == farm_id

    async def test_update_farm_partial(self, client: AsyncClient, authenticated_user):
        """Only update lat/lng, leave name unchanged."""
        headers = authenticated_user["headers"]
        create_resp = await client.post(
            PREFIX, json={"name": "Partial Farm"}, headers=headers
        )
        farm_id = create_resp.json()["id"]

        response = await client.put(
            f"{PREFIX}/{farm_id}",
            json={"lat": 40.7128, "lng": -74.0060},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Partial Farm"  # unchanged
        assert data["lat"] == pytest.approx(40.7128)
        assert data["lng"] == pytest.approx(-74.0060)

    async def test_update_nonexistent_farm(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.put(
            f"{PREFIX}/{fake_id}",
            json={"name": "Ghost"},
            headers=authenticated_user["headers"],
        )
        assert response.status_code == 404


@pytest.mark.asyncio
class TestDeleteFarm:

    async def test_delete_farm_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(
            PREFIX, json={"name": "Doomed Farm"}, headers=headers
        )
        farm_id = create_resp.json()["id"]

        # Delete
        del_resp = await client.delete(f"{PREFIX}/{farm_id}", headers=headers)
        assert del_resp.status_code == 204

        # Confirm it's gone
        get_resp = await client.get(f"{PREFIX}/{farm_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_nonexistent_farm(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404

    async def test_delete_farm_unauthenticated(self, client: AsyncClient):
        fake_id = str(uuid.uuid4())
        response = await client.delete(f"{PREFIX}/{fake_id}")
        assert response.status_code == 403
