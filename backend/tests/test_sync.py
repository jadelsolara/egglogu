"""Tests for the sync module."""
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

PREFIX = "/api/v1/sync"


@pytest.mark.asyncio
class TestSync:
    async def test_sync_unauthenticated(self, client: AsyncClient):
        response = await client.post(PREFIX, json={"data": {}})
        assert response.status_code == 401

    async def test_sync_empty_payload(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        response = await client.post(PREFIX, json={"data": {}}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["synced"] == 0
        assert data["conflicts"] == []
        assert "server_now" in data

    async def test_sync_unknown_entity(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"data": {"unknown_entity": [{"name": "test"}]}}
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert any("Unknown entity" in c for c in data["conflicts"])

    async def test_sync_with_last_synced_at(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {
            "last_synced_at": "2020-01-01T00:00:00+00:00",
            "data": {},
        }
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["synced"] == 0

    async def test_sync_create_farm(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {
            "data": {
                "farms": [{"name": "Sync Farm"}]
            }
        }
        response = await client.post(PREFIX, json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["synced"] == 1
