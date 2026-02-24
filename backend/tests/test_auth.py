"""Tests for /api/v1/auth endpoints: register, login, token refresh, /me."""

import pytest
from httpx import AsyncClient


PREFIX = "/api/v1/auth"


@pytest.mark.asyncio
class TestRegister:

    async def test_register_success(self, client: AsyncClient):
        payload = {
            "email": "newuser@example.com",
            "password": "StrongPass123",
            "full_name": "New User",
            "organization_name": "New Org",
        }
        response = await client.post(f"{PREFIX}/register", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert "message" in data
        assert "Account created" in data["message"]

    async def test_register_duplicate_email(self, client: AsyncClient):
        payload = {
            "email": "duplicate@example.com",
            "password": "StrongPass123",
            "full_name": "User One",
            "organization_name": "Org One",
        }
        # First registration
        resp1 = await client.post(f"{PREFIX}/register", json=payload)
        assert resp1.status_code == 201

        # Second registration with same email
        payload["organization_name"] = "Org Two"
        resp2 = await client.post(f"{PREFIX}/register", json=payload)
        assert resp2.status_code == 409
        assert "already registered" in resp2.json()["detail"]

    async def test_register_short_password_rejected(self, client: AsyncClient):
        payload = {
            "email": "short@example.com",
            "password": "abc",
            "full_name": "Short Pass",
            "organization_name": "Org",
        }
        response = await client.post(f"{PREFIX}/register", json=payload)
        assert response.status_code == 422  # Validation error

    async def test_register_invalid_email_rejected(self, client: AsyncClient):
        payload = {
            "email": "not-an-email",
            "password": "StrongPass123",
            "full_name": "Bad Email",
            "organization_name": "Org",
        }
        response = await client.post(f"{PREFIX}/register", json=payload)
        assert response.status_code == 422

    async def test_register_missing_fields(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/register", json={})
        assert response.status_code == 422


@pytest.mark.asyncio
class TestLogin:

    async def _register_and_verify(self, client: AsyncClient, email: str, password: str):
        """Helper: register a user, then manually verify via DB bypass."""
        payload = {
            "email": email,
            "password": password,
            "full_name": "Login Tester",
            "organization_name": "Login Org",
        }
        await client.post(f"{PREFIX}/register", json=payload)

        # Verify email by hitting verify-email with the token from DB.
        # Since we mock emails, we need to read the token from the user record.
        # Instead, we directly create a verified user in conftest.
        # For login tests, use the authenticated_user fixture or
        # verify via the DB session.

    async def test_login_success(self, client: AsyncClient, authenticated_user):
        """Login with a pre-verified user (from fixture)."""
        payload = {
            "email": "testuser@example.com",
            "password": "TestPassword123",
        }
        response = await client.post(f"{PREFIX}/login", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, authenticated_user):
        payload = {
            "email": "testuser@example.com",
            "password": "WrongPassword999",
        }
        response = await client.post(f"{PREFIX}/login", json=payload)
        assert response.status_code == 401
        assert "Invalid email or password" in response.json()["detail"]

    async def test_login_nonexistent_user(self, client: AsyncClient):
        payload = {
            "email": "nobody@example.com",
            "password": "SomePassword123",
        }
        response = await client.post(f"{PREFIX}/login", json=payload)
        assert response.status_code == 401

    async def test_login_unverified_email(self, client: AsyncClient, db_session):
        """Register a user (email not verified) and attempt login."""
        payload = {
            "email": "unverified@example.com",
            "password": "StrongPass123",
            "full_name": "Unverified User",
            "organization_name": "Unverified Org",
        }
        await client.post(f"{PREFIX}/register", json=payload)

        login_payload = {
            "email": "unverified@example.com",
            "password": "StrongPass123",
        }
        response = await client.post(f"{PREFIX}/login", json=login_payload)
        assert response.status_code == 401
        assert "not verified" in response.json()["detail"]


@pytest.mark.asyncio
class TestTokenRefresh:

    async def test_refresh_token_success(self, client: AsyncClient, authenticated_user):
        # First login to get tokens
        login_resp = await client.post(f"{PREFIX}/login", json={
            "email": "testuser@example.com",
            "password": "TestPassword123",
        })
        tokens = login_resp.json()

        # Use refresh token
        response = await client.post(f"{PREFIX}/refresh", json={
            "refresh_token": tokens["refresh_token"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_with_invalid_token(self, client: AsyncClient):
        response = await client.post(f"{PREFIX}/refresh", json={
            "refresh_token": "invalid.token.here",
        })
        assert response.status_code == 401

    async def test_refresh_with_access_token_rejected(self, client: AsyncClient, authenticated_user):
        """Using an access token as refresh token should fail (wrong type)."""
        login_resp = await client.post(f"{PREFIX}/login", json={
            "email": "testuser@example.com",
            "password": "TestPassword123",
        })
        tokens = login_resp.json()

        response = await client.post(f"{PREFIX}/refresh", json={
            "refresh_token": tokens["access_token"],  # wrong token type
        })
        assert response.status_code == 401


@pytest.mark.asyncio
class TestMe:

    async def test_me_authenticated(self, client: AsyncClient, authenticated_user):
        response = await client.get(
            f"{PREFIX}/me",
            headers=authenticated_user["headers"],
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "testuser@example.com"
        assert data["full_name"] == "Test User"
        assert data["role"] == "owner"
        assert data["is_active"] is True
        assert data["email_verified"] is True

    async def test_me_unauthenticated(self, client: AsyncClient):
        response = await client.get(f"{PREFIX}/me")
        assert response.status_code == 401  # HTTPBearer returns 403 when no token

    async def test_me_invalid_token(self, client: AsyncClient):
        response = await client.get(
            f"{PREFIX}/me",
            headers={"Authorization": "Bearer invalid.jwt.token"},
        )
        assert response.status_code == 401
