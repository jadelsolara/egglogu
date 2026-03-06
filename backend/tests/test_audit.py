import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_list_audit_logs(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/audit/logs",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    data = resp.json()
    # Supports both list and paginated response formats
    assert isinstance(data, list) or (isinstance(data, dict) and "items" in data)
