"""Tests for /api/v1/webhooks endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/webhooks"


@pytest.mark.asyncio
class TestCreateWebhook:
    async def test_create(self, client: AsyncClient, authenticated_user):
        resp = await client.post(
            PREFIX,
            json={
                "name": "Test Webhook",
                "url": "https://example.com/webhook",
                "events": ["production.new", "health.alert"],
            },
            headers=authenticated_user["headers"],
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["name"] == "Test Webhook"
        return data

    async def test_create_unauth(self, client: AsyncClient):
        resp = await client.post(
            PREFIX,
            json={"name": "Bad", "url": "https://example.com", "events": ["x"]},
        )
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestListWebhooks:
    async def test_list_empty(self, client: AsyncClient, authenticated_user):
        resp = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert resp.status_code == 200

    async def test_list_after_create(self, client: AsyncClient, authenticated_user):
        await client.post(
            PREFIX,
            json={"name": "WH1", "url": "https://example.com/wh1", "events": ["production.new"]},
            headers=authenticated_user["headers"],
        )
        resp = await client.get(PREFIX, headers=authenticated_user["headers"])
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestWebhookDetail:
    async def test_get_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestWebhookUpdate:
    async def test_update_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.put(
            f"{PREFIX}/{fake_id}",
            json={"name": "Updated"},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestWebhookDelete:
    async def test_delete_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.delete(f"{PREFIX}/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestWebhookDeliveries:
    async def test_deliveries_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/{fake_id}/deliveries", headers=authenticated_user["headers"])
        assert resp.status_code == 404
