"""Tests for pagination on list endpoints."""
import pytest
from httpx import AsyncClient

PAGINATED_ENDPOINTS = [
    "/api/v1/farms/",
    "/api/v1/flocks/",
    "/api/v1/production/",
    "/api/v1/clients/",
    "/api/v1/vaccines",
    "/api/v1/medications",
    "/api/v1/outbreaks",
    "/api/v1/stress-events",
    "/api/v1/income",
    "/api/v1/expenses",
    "/api/v1/receivables",
    "/api/v1/feed/purchases",
    "/api/v1/feed/consumption",
    "/api/v1/environment",
    "/api/v1/iot-readings",
    "/api/v1/weather",
    "/api/v1/checklist",
    "/api/v1/logbook",
    "/api/v1/personnel",
]


@pytest.mark.asyncio
class TestPagination:
    async def test_endpoints_accept_page_size(self, client: AsyncClient, authenticated_user):
        """All list endpoints should accept page and size query params."""
        headers = authenticated_user["headers"]
        for endpoint in PAGINATED_ENDPOINTS:
            response = await client.get(
                f"{endpoint}?page=1&size=10", headers=headers
            )
            assert response.status_code == 200, (
                f"{endpoint} returned {response.status_code}"
            )
            assert isinstance(response.json(), list)

    async def test_pagination_invalid_page(self, client: AsyncClient, authenticated_user):
        """Page < 1 should return 422."""
        headers = authenticated_user["headers"]
        response = await client.get(
            "/api/v1/farms/?page=0&size=10", headers=headers
        )
        assert response.status_code == 422

    async def test_pagination_size_limit(self, client: AsyncClient, authenticated_user):
        """Size > 200 should return 422."""
        headers = authenticated_user["headers"]
        response = await client.get(
            "/api/v1/farms/?page=1&size=500", headers=headers
        )
        assert response.status_code == 422

    async def test_default_pagination(self, client: AsyncClient, authenticated_user):
        """Without params, should still return results (defaults: page=1, size=50)."""
        headers = authenticated_user["headers"]
        response = await client.get("/api/v1/farms/", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
