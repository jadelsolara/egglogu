"""Tests for auth_security fail-closed behavior when Redis is unavailable.

When Redis is down, all security functions must fail-closed (deny access)
rather than fail-open (allow access).
"""

import pytest
from unittest.mock import AsyncMock, patch

from src.core.auth_security import (
    LOCKOUT_MAX_ATTEMPTS,
    LOCKOUT_WINDOW_SECONDS,
    blacklist_token,
    get_lockout_remaining,
    is_account_locked,
    is_token_blacklisted,
    record_failed_login,
)


@pytest.fixture
def redis_unavailable():
    """Simulate Redis being completely unavailable (returns None)."""
    with patch("src.core.auth_security._get_redis", new_callable=AsyncMock, return_value=None):
        yield


@pytest.fixture
def redis_error():
    """Simulate Redis raising an exception on every operation."""
    mock_redis = AsyncMock()
    mock_redis.exists.side_effect = ConnectionError("Redis connection lost")
    mock_redis.incr.side_effect = ConnectionError("Redis connection lost")
    mock_redis.get.side_effect = ConnectionError("Redis connection lost")
    mock_redis.ttl.side_effect = ConnectionError("Redis connection lost")
    mock_redis.setex.side_effect = ConnectionError("Redis connection lost")
    with patch("src.core.auth_security._get_redis", new_callable=AsyncMock, return_value=mock_redis):
        yield


# ── Redis=None (unavailable) tests ──


@pytest.mark.asyncio
async def test_is_token_blacklisted_redis_none(redis_unavailable):
    """Redis down → token treated as blacklisted (fail-closed)."""
    result = await is_token_blacklisted("some-jti")
    assert result is True


@pytest.mark.asyncio
async def test_record_failed_login_redis_none(redis_unavailable):
    """Redis down → return max attempts (fail-closed, triggers lockout)."""
    result = await record_failed_login("user@example.com")
    assert result == LOCKOUT_MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_is_account_locked_redis_none(redis_unavailable):
    """Redis down → account treated as locked (fail-closed)."""
    result = await is_account_locked("user@example.com")
    assert result is True


@pytest.mark.asyncio
async def test_get_lockout_remaining_redis_none(redis_unavailable):
    """Redis down → return full lockout window (fail-closed)."""
    result = await get_lockout_remaining("user@example.com")
    assert result == LOCKOUT_WINDOW_SECONDS


@pytest.mark.asyncio
async def test_blacklist_token_redis_none(redis_unavailable):
    """Redis down → blacklist_token should not raise (logs CRITICAL)."""
    await blacklist_token("some-jti", 3600)  # should not raise


# ── Redis exception tests ──


@pytest.mark.asyncio
async def test_is_token_blacklisted_redis_error(redis_error):
    """Redis error → token treated as blacklisted (fail-closed)."""
    result = await is_token_blacklisted("some-jti")
    assert result is True


@pytest.mark.asyncio
async def test_record_failed_login_redis_error(redis_error):
    """Redis error → return max attempts (fail-closed)."""
    result = await record_failed_login("user@example.com")
    assert result == LOCKOUT_MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_is_account_locked_redis_error(redis_error):
    """Redis error → account treated as locked (fail-closed)."""
    result = await is_account_locked("user@example.com")
    assert result is True


@pytest.mark.asyncio
async def test_get_lockout_remaining_redis_error(redis_error):
    """Redis error → return full lockout window (fail-closed)."""
    result = await get_lockout_remaining("user@example.com")
    assert result == LOCKOUT_WINDOW_SECONDS


@pytest.mark.asyncio
async def test_blacklist_token_redis_error(redis_error):
    """Redis error → blacklist_token should not raise (logs CRITICAL)."""
    await blacklist_token("some-jti", 3600)  # should not raise
