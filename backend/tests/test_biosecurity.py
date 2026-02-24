"""Tests for /api/v1/biosecurity endpoints (visitors, zones, pests, protocols)."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/biosecurity"


# ── Visitors ──


@pytest.mark.asyncio
class TestListVisitors:

    async def test_list_visitors_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/visitors", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_visitors_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/visitors", json={
            "date": "2025-01-01", "name": "Inspector"
        }, headers=headers)
        await client.post(f"{PREFIX}/visitors", json={
            "date": "2025-01-02", "name": "Vet"
        }, headers=headers)

        response = await client.get(f"{PREFIX}/visitors", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_visitors_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/visitors")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateVisitor:

    async def test_create_visitor_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"date": "2025-01-01", "name": "Inspector"}
        response = await client.post(f"{PREFIX}/visitors", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_visitor_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/visitors", json={
            "date": "2025-01-01", "name": "Inspector"
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteVisitor:

    async def test_delete_visitor_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/visitors", json={
            "date": "2025-01-01", "name": "Doomed Visitor"
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/visitors/{item_id}", headers=headers)
        assert del_resp.status_code == 204

    async def test_delete_visitor_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/visitors/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Zones ──


@pytest.mark.asyncio
class TestListZones:

    async def test_list_zones_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/zones", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_zones_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/zones", json={"name": "Zone A"}, headers=headers)
        await client.post(f"{PREFIX}/zones", json={"name": "Zone B"}, headers=headers)

        response = await client.get(f"{PREFIX}/zones", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_zones_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/zones")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateZone:

    async def test_create_zone_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"name": "Zone A"}
        response = await client.post(f"{PREFIX}/zones", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_zone_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/zones", json={"name": "Zone A"})
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteZone:

    async def test_delete_zone_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/zones", json={"name": "Doomed Zone"}, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/zones/{item_id}", headers=headers)
        assert del_resp.status_code == 204

    async def test_delete_zone_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/zones/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Pests ──


@pytest.mark.asyncio
class TestListPests:

    async def test_list_pests_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/pests", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_pests_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/pests", json={
            "date": "2025-01-01", "pest_type": "rodent"
        }, headers=headers)
        await client.post(f"{PREFIX}/pests", json={
            "date": "2025-01-02", "pest_type": "insect"
        }, headers=headers)

        response = await client.get(f"{PREFIX}/pests", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_pests_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/pests")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreatePest:

    async def test_create_pest_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"date": "2025-01-01", "pest_type": "rodent"}
        response = await client.post(f"{PREFIX}/pests", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_pest_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/pests", json={
            "date": "2025-01-01", "pest_type": "rodent"
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeletePest:

    async def test_delete_pest_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/pests", json={
            "date": "2025-01-01", "pest_type": "rodent"
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/pests/{item_id}", headers=headers)
        assert del_resp.status_code == 204

    async def test_delete_pest_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/pests/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Protocols ──


@pytest.mark.asyncio
class TestListProtocols:

    async def test_list_protocols_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/protocols", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_protocols_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/protocols", json={"name": "Entry Protocol"}, headers=headers)
        await client.post(f"{PREFIX}/protocols", json={"name": "Exit Protocol"}, headers=headers)

        response = await client.get(f"{PREFIX}/protocols", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_protocols_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/protocols")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateProtocol:

    async def test_create_protocol_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"name": "Entry Protocol"}
        response = await client.post(f"{PREFIX}/protocols", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_protocol_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/protocols", json={"name": "Entry Protocol"})
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteProtocol:

    async def test_delete_protocol_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/protocols", json={
            "name": "Doomed Protocol"
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/protocols/{item_id}", headers=headers)
        assert del_resp.status_code == 204

    async def test_delete_protocol_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/protocols/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
