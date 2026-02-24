import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_list_suppliers_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/procurement/suppliers",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_supplier(client: AsyncClient, authenticated_user):
    resp = await client.post(
        "/api/v1/procurement/suppliers",
        headers=authenticated_user["headers"],
        json={
            "name": "Nutriaves LATAM",
            "contact_name": "Carlos Mendez",
            "phone": "+52-555-123-4567",
            "category": "feed",
            "payment_terms_days": 30,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Nutriaves LATAM"
    assert data["payment_terms_days"] == 30


async def test_create_purchase_order(client: AsyncClient, authenticated_user):
    # First create supplier
    supplier_resp = await client.post(
        "/api/v1/procurement/suppliers",
        headers=authenticated_user["headers"],
        json={"name": "Feed Corp", "category": "feed"},
    )
    supplier_id = supplier_resp.json()["id"]

    resp = await client.post(
        "/api/v1/procurement/orders",
        headers=authenticated_user["headers"],
        json={
            "supplier_id": supplier_id,
            "category": "feed",
            "order_date": "2026-02-24",
            "expected_delivery": "2026-03-01",
            "items": [
                {
                    "description": "Layer Feed Premium 22%",
                    "quantity": 5000,
                    "unit": "kg",
                    "unit_price": 0.45,
                },
                {
                    "description": "Oyster Shell",
                    "quantity": 500,
                    "unit": "kg",
                    "unit_price": 0.20,
                },
            ],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["po_number"].startswith("PO-")
    assert len(data["items"]) == 2
    assert data["subtotal"] == 5000 * 0.45 + 500 * 0.20
