"""Tests for /api/v1 operations endpoints (checklist, logbook, personnel)."""

import uuid

import pytest
from httpx import AsyncClient


API = "/api/v1"


# ── Checklist ──


@pytest.mark.asyncio
class TestListChecklist:

    async def test_list_checklist_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/checklist", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_checklist_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{API}/checklist", json={"label": "Check water"}, headers=headers)
        await client.post(f"{API}/checklist", json={"label": "Check feed"}, headers=headers)

        response = await client.get(f"{API}/checklist", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_checklist_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/checklist")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateChecklist:

    async def test_create_checklist_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"label": "Check water"}
        response = await client.post(f"{API}/checklist", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_checklist_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/checklist", json={"label": "Check water"})
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteChecklist:

    async def test_delete_checklist_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{API}/checklist", json={"label": "Doomed item"}, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/checklist/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/checklist/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_checklist_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/checklist/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Logbook ──


@pytest.mark.asyncio
class TestListLogbook:

    async def test_list_logbook_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/logbook", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_logbook_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{API}/logbook", json={"date": "2025-01-01", "text": "All normal"}, headers=headers)
        await client.post(f"{API}/logbook", json={"date": "2025-01-02", "text": "Rainy day"}, headers=headers)

        response = await client.get(f"{API}/logbook", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_logbook_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/logbook")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreateLogbook:

    async def test_create_logbook_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"date": "2025-01-01", "text": "All normal"}
        response = await client.post(f"{API}/logbook", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_logbook_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/logbook", json={"date": "2025-01-01", "text": "All normal"})
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeleteLogbook:

    async def test_delete_logbook_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{API}/logbook", json={
            "date": "2025-01-01", "text": "Doomed entry"
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/logbook/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/logbook/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_logbook_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/logbook/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404


# ── Personnel ──


@pytest.mark.asyncio
class TestListPersonnel:

    async def test_list_personnel_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{API}/personnel", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_personnel_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{API}/personnel", json={"name": "John", "role": "caretaker"}, headers=headers)
        await client.post(f"{API}/personnel", json={"name": "Jane", "role": "manager"}, headers=headers)

        response = await client.get(f"{API}/personnel", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_personnel_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{API}/personnel")
        assert response.status_code == 401


@pytest.mark.asyncio
class TestCreatePersonnel:

    async def test_create_personnel_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"name": "John", "role": "caretaker"}
        response = await client.post(f"{API}/personnel", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    async def test_create_personnel_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{API}/personnel", json={"name": "John", "role": "caretaker"})
        assert response.status_code == 401


@pytest.mark.asyncio
class TestDeletePersonnel:

    async def test_delete_personnel_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{API}/personnel", json={
            "name": "Doomed Worker", "role": "caretaker"
        }, headers=headers)
        item_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{API}/personnel/{item_id}", headers=headers)
        assert del_resp.status_code == 204

        get_resp = await client.get(f"{API}/personnel/{item_id}", headers=headers)
        assert get_resp.status_code == 404

    async def test_delete_personnel_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.delete(
            f"{API}/personnel/{fake_id}", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
