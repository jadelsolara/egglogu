import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_list_locations_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/inventory/locations",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_location(client: AsyncClient, authenticated_user):
    resp = await client.post(
        "/api/v1/inventory/locations",
        headers=authenticated_user["headers"],
        json={"name": "Cold Room A", "code": "CRA-01", "temp_controlled": True},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Cold Room A"
    assert data["temp_controlled"] is True


async def test_list_stock_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/inventory/stock",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_stock(client: AsyncClient, authenticated_user):
    resp = await client.post(
        "/api/v1/inventory/stock",
        headers=authenticated_user["headers"],
        json={
            "date": "2026-02-24",
            "egg_size": "large",
            "quality_grade": "AA",
            "quantity": 3600,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["quantity"] == 3600


async def test_list_packaging_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/inventory/packaging",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
