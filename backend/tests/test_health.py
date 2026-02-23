"""Tests for the /health endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthEndpoint:

    async def test_health_returns_200(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_returns_ok_status(self, client: AsyncClient):
        response = await client.get("/health")
        data = response.json()
        assert data == {"status": "ok"}

    async def test_health_content_type(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.headers["content-type"] == "application/json"
