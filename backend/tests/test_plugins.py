"""Tests for /api/v1/plugins endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/plugins"


@pytest.mark.asyncio
class TestMarketplace:
    async def test_list_marketplace(self, client: AsyncClient, authenticated_user):
        resp = await client.get(f"{PREFIX}/marketplace", headers=authenticated_user["headers"])
        assert resp.status_code == 200

    async def test_marketplace_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/marketplace")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestListInstalled:
    async def test_list_installed_empty(self, client: AsyncClient, authenticated_user):
        resp = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestPluginInstall:
    async def test_install_not_found(self, client: AsyncClient, authenticated_user):
        resp = await client.post(
            PREFIX,
            json={"plugin_id": str(uuid.uuid4())},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code in (404, 422)


@pytest.mark.asyncio
class TestPluginDetail:
    async def test_get_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestPluginDelete:
    async def test_delete_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.delete(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestRegistryHooks:
    async def test_list_hooks(self, client: AsyncClient, authenticated_user):
        resp = await client.get(f"{PREFIX}/registry/hooks", headers=authenticated_user["headers"])
        assert resp.status_code == 200
