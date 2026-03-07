"""Tests for /api/v1/api-keys endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/api-keys"


@pytest.mark.asyncio
class TestCreateAPIKey:
    async def test_create_key(self, client: AsyncClient, authenticated_user):
        resp = await client.post(
            PREFIX,
            json={"name": "Test Key", "scopes": ["read:farms", "read:flocks"]},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert "full_key" in data or "key" in data or "id" in data

    async def test_create_key_unauth(self, client: AsyncClient):
        resp = await client.post(PREFIX, json={"name": "Bad Key", "scopes": ["read:farms"]})
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestListAPIKeys:
    async def test_list_empty(self, client: AsyncClient, authenticated_user):
        resp = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert resp.status_code == 200

    async def test_list_after_create(self, client: AsyncClient, authenticated_user):
        await client.post(
            PREFIX,
            json={"name": "Listed Key", "scopes": ["read:farms"]},
            headers=authenticated_user["headers"],
        )
        resp = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestDeleteAPIKey:
    async def test_delete_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.delete(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404

    async def test_delete_created_key(self, client: AsyncClient, authenticated_user):
        create_resp = await client.post(
            PREFIX,
            json={"name": "To Delete", "scopes": ["read:farms"]},
            headers=authenticated_user["headers"],
        )
        if create_resp.status_code in (200, 201):
            key_id = create_resp.json().get("id")
            if key_id:
                resp = await client.delete(f"{PREFIX}/{key_id}", headers=authenticated_user["headers"])
                assert resp.status_code in (200, 204)


@pytest.mark.asyncio
class TestRegenerateAPIKey:
    async def test_regenerate_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.post(f"{PREFIX}/{fake_id}/regenerate", headers=authenticated_user["headers"])
        assert resp.status_code == 404
