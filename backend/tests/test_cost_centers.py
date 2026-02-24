import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_list_cost_centers_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/cost-centers",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_cost_center(client: AsyncClient, authenticated_user):
    resp = await client.post(
        "/api/v1/cost-centers",
        headers=authenticated_user["headers"],
        json={
            "name": "Nave A - Lote Hy-Line W-36",
            "code": "CC-NAVE-A",
            "center_type": "flock",
            "budget_monthly": 15000.00,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Nave A - Lote Hy-Line W-36"
    assert data["code"] == "CC-NAVE-A"
    assert data["budget_monthly"] == 15000.00


async def test_create_cost_allocation(client: AsyncClient, authenticated_user):
    # First create a cost center
    center_resp = await client.post(
        "/api/v1/cost-centers",
        headers=authenticated_user["headers"],
        json={"name": "Nave B", "code": "CC-NAVE-B", "center_type": "flock"},
    )
    center_id = center_resp.json()["id"]

    # Create allocation
    resp = await client.post(
        "/api/v1/cost-centers/allocations",
        headers=authenticated_user["headers"],
        json={
            "cost_center_id": center_id,
            "date": "2026-02-24",
            "category": "feed",
            "description": "Layer Feed Premium 22% - 5 tons",
            "amount": 2250.00,
            "allocation_method": "direct",
            "allocation_pct": 100.0,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount"] == 2250.00
    assert data["category"] == "feed"


async def test_create_pl_snapshot(client: AsyncClient, authenticated_user):
    # Create cost center
    center_resp = await client.post(
        "/api/v1/cost-centers",
        headers=authenticated_user["headers"],
        json={"name": "Nave C", "code": "CC-NAVE-C"},
    )
    center_id = center_resp.json()["id"]

    # Create P&L snapshot
    resp = await client.post(
        f"/api/v1/cost-centers/{center_id}/pl",
        headers=authenticated_user["headers"],
        json={
            "cost_center_id": center_id,
            "period_start": "2026-02-01",
            "period_end": "2026-02-28",
            "total_revenue": 45000.00,
            "total_cost": 32000.00,
            "eggs_produced": 180000,
            "eggs_sold": 175000,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["gross_profit"] == 13000.00
    assert data["margin_pct"] == 28.89
    assert data["cost_per_dozen"] is not None


async def test_cost_center_overview(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/cost-centers/summary/overview",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
