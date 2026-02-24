"""Tests for /api/v1/billing endpoints."""

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/billing"


@pytest.mark.asyncio
class TestBillingPricing:

    async def test_get_pricing_public(self, client: AsyncClient):
        """Pricing endpoint is public: no auth needed, should return 200."""
        response = await client.get(f"{PREFIX}/pricing")
        assert response.status_code == 200
        data = response.json()
        assert "tiers" in data
        assert isinstance(data["tiers"], list)
        assert len(data["tiers"]) > 0


@pytest.mark.asyncio
class TestBillingStatus:

    async def test_billing_status_authenticated(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        response = await client.get(f"{PREFIX}/status", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "plan" in data
        assert "status" in data
        assert "modules" in data

    async def test_billing_status_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/status")
        assert response.status_code == 401
