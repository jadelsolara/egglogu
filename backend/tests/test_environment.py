"""Tests for /api/v1 environment endpoints (environment, iot-readings, weather)."""

import uuid

import pytest
from httpx import AsyncClient


API = "/api/v1"


# ── Environment Readings ──


@pytest.mark.asyncio
class TestListEnvironment:

    async def test_list_environment_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/environment", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_environment_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{API}/environment", json={
            "date": "2025-01-01", "temp_c": 25.0, "humidity_pct": 60
        }, headers=headers)
        await client.post(f"{API}/environment", json={
            "date": "2025-01-02", "temp_c": 26.0, "humidity_pct": 65
        }, headers=headers)

        response = await client.get(f"{API}/environment", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_environment_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/environment")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateEnvironment:

    async def test_create_environment_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"date": "2025-01-01", "temp_c": 25.0, "humidity_pct": 60}
        response = await client.post(f"{API}/environment", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_environment_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/environment", json={
            "date": "2025-01-01", "temp_c": 25.0, "humidity_pct": 60
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteEnvironment:

    async def test_delete_environment_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{API}/environment", json={
            "date": "2025-01-01", "temp_c": 25.0, "humidity_pct": 60
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/environment/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/environment/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_environment_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/environment/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── IoT Readings ──


@pytest.mark.asyncio
class TestListIoT:

    async def test_list_iot_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/iot-readings", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_iot_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{API}/iot-readings", json={
            "timestamp": "2025-01-01T12:00:00Z", "sensor_type": "temperature", "value": 25.0
        }, headers=headers)
        await client.post(f"{API}/iot-readings", json={
            "timestamp": "2025-01-01T13:00:00Z", "sensor_type": "humidity", "value": 60.0
        }, headers=headers)

        response = await client.get(f"{API}/iot-readings", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_iot_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/iot-readings")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateIoT:

    async def test_create_iot_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"timestamp": "2025-01-01T12:00:00Z", "sensor_type": "temperature", "value": 25.0}
        response = await client.post(f"{API}/iot-readings", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_iot_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/iot-readings", json={
            "timestamp": "2025-01-01T12:00:00Z", "sensor_type": "temperature", "value": 25.0
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteIoT:

    async def test_delete_iot_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{API}/iot-readings", json={
            "timestamp": "2025-01-01T12:00:00Z", "sensor_type": "temperature", "value": 25.0
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/iot-readings/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/iot-readings/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_iot_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/iot-readings/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Weather ──


@pytest.mark.asyncio
class TestListWeather:

    async def test_list_weather_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/weather", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_weather_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/weather")
        assert response.status_code == 401
