"""Tests for /api/v1 finance endpoints (income, expenses, receivables)."""

import uuid

import pytest
from httpx import AsyncClient


API = "/api/v1"
CLIENT_PREFIX = "/api/v1/clients"


async def _create_client(client: AsyncClient, headers: dict) -> str:
    """Helper: create a client and return its id."""
    resp = await client.post(CLIENT_PREFIX, json={"name": "Finance Client"}, headers=headers)
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Income ──


@pytest.mark.asyncio
class TestListIncome:

    async def test_list_income_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/income", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_income_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        client_id = await _create_client(client, headers)
        await client.post(f"{API}/income", json={
            "client_id": client_id, "date": "2025-01-01",
            "dozens": 10, "unit_price": 2.5, "total": 25
        }, headers=headers)
        await client.post(f"{API}/income", json={
            "client_id": client_id, "date": "2025-01-02",
            "dozens": 20, "unit_price": 2.5, "total": 50
        }, headers=headers)

        response = await client.get(f"{API}/income", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_income_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/income")
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateIncome:

    async def test_create_income_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        client_id = await _create_client(client, headers)
        payload = {
            "client_id": client_id, "date": "2025-01-01",
            "dozens": 10, "unit_price": 2.5, "total": 25
        }
        response = await client.post(f"{API}/income", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_income_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/income", json={
            "client_id": str(uuid.uuid4()), "date": "2025-01-01",
            "dozens": 10, "unit_price": 2.5, "total": 25
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeleteIncome:

    async def test_delete_income_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        client_id = await _create_client(client, headers)
        create_resp = await client.post(f"{API}/income", json={
            "client_id": client_id, "date": "2025-01-01",
            "dozens": 10, "unit_price": 2.5, "total": 25
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/income/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/income/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_income_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/income/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Expenses ──


@pytest.mark.asyncio
class TestListExpenses:

    async def test_list_expenses_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/expenses", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_expenses_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{API}/expenses", json={
            "date": "2025-01-01", "category": "feed", "amount": 500, "description": "Feed purchase"
        }, headers=headers)
        await client.post(f"{API}/expenses", json={
            "date": "2025-01-02", "category": "utilities", "amount": 100, "description": "Electricity"
        }, headers=headers)

        response = await client.get(f"{API}/expenses", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_expenses_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/expenses")
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateExpense:

    async def test_create_expense_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"date": "2025-01-01", "category": "feed", "amount": 500, "description": "Feed purchase"}
        response = await client.post(f"{API}/expenses", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_expense_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/expenses", json={
            "date": "2025-01-01", "category": "feed", "amount": 500, "description": "Feed purchase"
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeleteExpense:

    async def test_delete_expense_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{API}/expenses", json={
            "date": "2025-01-01", "category": "feed", "amount": 500, "description": "Feed purchase"
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/expenses/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/expenses/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_expense_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/expenses/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Receivables ──


@pytest.mark.asyncio
class TestListReceivables:

    async def test_list_receivables_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/receivables", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_receivables_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/receivables")
        assert response.status_code == 403
