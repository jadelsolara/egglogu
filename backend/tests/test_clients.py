"""Tests for /api/v1/clients CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/clients"


@pytest.mark.asyncio
class TestListClients:

    async def test_list_clients_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_clients_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(PREFIX, json={"name": "Client Alpha"}, headers=headers)
        await client.post(PREFIX, json={"name": "Client Beta"}, headers=headers)

        response = await client.get(PREFIX, headers=headers)
        assert response.status_code == 200
        clients = response.json()
        assert len(clients) == 2
        names = {c["name"] for c in clients}
        assert names == {"Client Alpha", "Client Beta"}

    async def test_list_clients_unauthenticated(self, client: AsyncClient):
        response = await client.get(PREFIX)
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateClient:

    async def test_create_client_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"name": "Test Client"}
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Client"
        assert "id" in data

    async def test_create_client_unauthenticated(self, client: AsyncClient):
        response = await client.post(PREFIX, json={"name": "No Auth"})
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeleteClient:

    async def test_delete_client_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(PREFIX, json={"name": "Doomed Client"}, headers=headers)
        client_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/{client_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/{client_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_client_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
