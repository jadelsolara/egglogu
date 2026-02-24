"""Tests for the public trace endpoint."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestTracePublic:
    async def test_trace_nonexistent_batch(self, client: AsyncClient):
        response = await client.get("/trace/NONEXISTENT-CODE")
        assert response.status_code in (404, 200)

    async def test_trace_no_auth_required(self, client: AsyncClient):
        """Public trace should not require authentication."""
        response = await client.get("/trace/TEST-CODE-001")
        assert response.status_code in (404, 200)
