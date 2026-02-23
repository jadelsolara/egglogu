"""Tests for /api/v1/planning CRUD endpoints."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/planning"


@pytest.mark.asyncio
class TestListPlans:

    async def test_list_plans_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/plans", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_plans_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/plans", json={
            "name": "Q1 Plan", "eggs_needed": 10000
        }, headers=headers)
        await client.post(f"{PREFIX}/plans", json={
            "name": "Q2 Plan", "eggs_needed": 20000
        }, headers=headers)

        response = await client.get(f"{PREFIX}/plans", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_plans_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/plans")
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreatePlan:

    async def test_create_plan_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"name": "Q1 Plan", "eggs_needed": 10000}
        response = await client.post(f"{PREFIX}/plans", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Q1 Plan"
        assert "id" in data

    async def test_create_plan_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/plans", json={
            "name": "Q1 Plan", "eggs_needed": 10000
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestDeletePlan:

    async def test_delete_plan_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/plans", json={
            "name": "Doomed Plan", "eggs_needed": 5000
        }, headers=headers)
        plan_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{PREFIX}/plans/{plan_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{PREFIX}/plans/{plan_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_plan_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{PREFIX}/plans/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
