"""Tests for the healthcheck module."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthcheck:
    async def test_health_endpoint(self, client: AsyncClient):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    async def test_api_health_endpoint(self, client: AsyncClient):
        response = await client.get("/api/health")
        assert response.status_code == 200

    async def test_health_no_auth_required(self, client: AsyncClient):
        """Health endpoints should be public."""
        response = await client.get("/health")
        assert response.status_code == 200
