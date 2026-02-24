"""
Shared fixtures for EGGlogU backend tests.

- Uses SQLite in-memory via aiosqlite (no PostgreSQL needed).
- Mocks Redis rate limiting (always allows requests).
- Mocks email sending (no-op).
- Provides an authenticated client helper for protected routes.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# Environment overrides — MUST happen before any src imports
# ---------------------------------------------------------------------------
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"  # in-memory
os.environ["REDIS_URL"] = ""                         # disable Redis
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["RESEND_API_KEY"] = ""                    # disable email

from src.database import Base, get_db  # noqa: E402
from src.models.auth import Organization, Role, User  # noqa: E402
from src.models.subscription import (  # noqa: E402
    PlanTier,
    Subscription,
    SubscriptionStatus,
)
from src.core.security import hash_password, create_access_token  # noqa: E402

# ---------------------------------------------------------------------------
# Async SQLite engine (shared across the session)
# ---------------------------------------------------------------------------
TEST_ENGINE = create_async_engine(
    "sqlite+aiosqlite://",
    echo=False,
    connect_args={"check_same_thread": False},
)
TestSessionLocal = async_sessionmaker(
    TEST_ENGINE, class_=AsyncSession, expire_on_commit=False
)


# ---------------------------------------------------------------------------
# Database fixture — creates tables fresh for every test
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ---------------------------------------------------------------------------
# Override FastAPI's get_db so routes use our test session
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Provides an httpx.AsyncClient wired to the FastAPI app with the test DB.
    Rate limiting and email are mocked so tests never touch external services.
    """

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    # Patch rate limiting to always allow
    with patch("src.core.rate_limit.check_rate_limit", new_callable=AsyncMock, return_value=True):
        # Patch email sending to no-op
        with patch("src.api.auth.send_verification_email", new_callable=AsyncMock):
            with patch("src.api.auth.send_welcome", new_callable=AsyncMock):
                with patch("src.api.auth.send_password_reset", new_callable=AsyncMock):
                    # Import app here (after env vars are set)
                    from src.main import app

                    app.dependency_overrides[get_db] = _override_get_db

                    # Disable lifespan so we don't need Redis / real DB
                    transport = ASGITransport(app=app)
                    async with AsyncClient(
                        transport=transport,
                        base_url="http://testserver",
                        follow_redirects=True,
                    ) as ac:
                        yield ac

                    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper: Create a verified user in the DB and return (user, org, headers)
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def authenticated_user(db_session: AsyncSession):
    """
    Creates an Organization + User (email-verified, active, owner role)
    and returns a dict with user, org, and auth headers ready to use.
    """
    org = Organization(name="Test Org", slug="test-org")
    db_session.add(org)
    await db_session.flush()

    sub = Subscription(
        organization_id=org.id,
        plan=PlanTier.enterprise,
        status=SubscriptionStatus.active,
        is_trial=True,
        trial_end=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db_session.add(sub)

    user = User(
        email="testuser@example.com",
        hashed_password=hash_password("TestPassword123"),
        full_name="Test User",
        role=Role.owner,
        organization_id=org.id,
        is_active=True,
        email_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    token = create_access_token(user.id, org.id, user.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    return {"user": user, "org": org, "headers": headers}


# ---------------------------------------------------------------------------
# Helper: Create a sample farm + flock for tests that need flock_id
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def sample_farm(db_session: AsyncSession, authenticated_user):
    from src.models.farm import Farm
    farm = Farm(
        name="Test Farm",
        organization_id=authenticated_user["org"].id,
    )
    db_session.add(farm)
    await db_session.flush()
    return farm


@pytest_asyncio.fixture
async def sample_flock(db_session: AsyncSession, authenticated_user, sample_farm):
    from src.models.flock import Flock
    flock = Flock(
        name="Test Flock A",
        organization_id=authenticated_user["org"].id,
        farm_id=sample_farm.id,
        breed="Hy-Line W-36",
        initial_count=5000,
        current_count=5000,
        start_date=datetime(2025, 6, 1).date(),
    )
    db_session.add(flock)
    await db_session.flush()
    return flock
