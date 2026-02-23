"""Tests for leads router — POST /api/leads/"""
import pytest
from httpx import AsyncClient


PREFIX = "/api/leads"


@pytest.mark.asyncio
class TestCaptureLead:

    async def test_capture_lead_success(self, client: AsyncClient):
        """Test creating a lead with valid data"""
        resp = await client.post(f"{PREFIX}/", json={
            "email": "farmer@example.com",
            "farm_name": "Golden Eggs Farm",
            "country": "Colombia",
            "operation_size": "5000",
            "primary_need": "production_tracking",
            "source": "google"
        })
        assert resp.status_code == 201
        assert resp.json()["ok"] is True

    async def test_capture_lead_minimal(self, client: AsyncClient):
        """Test creating a lead with only required field"""
        resp = await client.post(f"{PREFIX}/", json={
            "email": "minimal@test.com"
        })
        assert resp.status_code == 201
        assert resp.json()["ok"] is True

    async def test_capture_lead_invalid_email(self, client: AsyncClient):
        """Test that invalid email is rejected"""
        resp = await client.post(f"{PREFIX}/", json={
            "email": "not-an-email"
        })
        assert resp.status_code == 422

    async def test_capture_lead_missing_email(self, client: AsyncClient):
        """Test that missing email is rejected"""
        resp = await client.post(f"{PREFIX}/", json={
            "farm_name": "No Email Farm"
        })
        assert resp.status_code == 422

    async def test_capture_lead_xss_in_fields(self, client: AsyncClient):
        """Test that XSS payloads are stored as plain text (not executed)"""
        resp = await client.post(f"{PREFIX}/", json={
            "email": "xss@test.com",
            "farm_name": "<script>alert('xss')</script>",
            "country": "<img src=x onerror=alert(1)>"
        })
        assert resp.status_code == 201

    async def test_capture_lead_sql_injection(self, client: AsyncClient):
        """Test that SQL injection in fields doesn't break"""
        resp = await client.post(f"{PREFIX}/", json={
            "email": "sqli@test.com",
            "farm_name": "'; DROP TABLE leads; --",
            "source": "1 UNION SELECT * FROM users"
        })
        assert resp.status_code == 201
