"""Tests for /api/v1/support endpoints (tickets + public FAQ)."""

import uuid

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/support"


# ── FAQ (public) ──


@pytest.mark.asyncio
class TestListFAQ:

    async def test_list_faq_public(self, client: AsyncClient):
        """FAQ list is public: no auth needed, should return 200."""
        response = await client.get(f"{PREFIX}/faq")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


# ── Tickets ──


@pytest.mark.asyncio
class TestListTickets:

    async def test_list_tickets_empty(self, client: AsyncClient, authenticated_user):
        response = await client.get(f"{PREFIX}/tickets", headers=authenticated_user["headers"])
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_tickets_returns_created(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        await client.post(f"{PREFIX}/tickets", json={
            "subject": "Test Ticket One", "description": "This is a test ticket for testing purposes"
        }, headers=headers)
        await client.post(f"{PREFIX}/tickets", json={
            "subject": "Test Ticket Two", "description": "Another test ticket for testing purposes"
        }, headers=headers)

        response = await client.get(f"{PREFIX}/tickets", headers=headers)
        assert response.status_code == 200
        assert len(response.json()) == 2

    async def test_list_tickets_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/tickets")
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCreateTicket:

    async def test_create_ticket_minimal(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        payload = {"subject": "Test Subject", "description": "Test ticket description for validation"}
        response = await client.post(f"{PREFIX}/tickets", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert "ticket_number" in data

    async def test_create_ticket_unauthenticated(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/tickets", json={
            "subject": "No Auth", "description": "This should fail without authentication"
        })
        assert response.status_code == 403


@pytest.mark.asyncio
class TestCloseTicket:

    async def test_close_ticket_success(self, client: AsyncClient, authenticated_user):
        headers = authenticated_user["headers"]
        create_resp = await client.post(f"{PREFIX}/tickets", json={
            "subject": "Close Me", "description": "This ticket will be closed for testing"
        }, headers=headers)
        ticket_id = create_resp.json()["id"]

        close_resp = await client.post(f"{PREFIX}/tickets/{ticket_id}/close", headers=headers)
        assert close_resp.status_code == 200
        assert close_resp.json()["ok"] is True

    async def test_close_ticket_nonexistent(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        response = await client.post(
            f"{PREFIX}/tickets/{fake_id}/close", headers=authenticated_user["headers"]
        )
        assert response.status_code == 404
