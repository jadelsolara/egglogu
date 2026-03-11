"""Tests para FeedService — Compras y consumo de alimento."""

import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from src.schemas.feed import (
    FeedConsumptionCreate,
    FeedConsumptionUpdate,
    FeedPurchaseCreate,
    FeedPurchaseUpdate,
)
from src.services.feed_service import FeedService

pytestmark = pytest.mark.asyncio


@patch("src.services.feed_service.invalidate_prefix", new_callable=AsyncMock)
async def test_create_purchase(mock_cache, db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FeedService(db_session, user.organization_id, user.id)

    data = FeedPurchaseCreate(
        date=date(2025, 7, 1),
        brand="Nutreco",
        kg=5000.0,
        price_per_kg=0.45,
        total_cost=2250.0,
    )
    purchase = await svc.create_purchase(data)

    assert purchase.kg == 5000.0
    assert purchase.organization_id == user.organization_id
    mock_cache.assert_called_once()


@patch("src.services.feed_service.invalidate_prefix", new_callable=AsyncMock)
async def test_list_purchases(mock_cache, db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FeedService(db_session, user.organization_id, user.id)

    await svc.create_purchase(FeedPurchaseCreate(
        date=date(2025, 7, 1), kg=1000.0, price_per_kg=0.5, total_cost=500.0,
    ))
    await svc.create_purchase(FeedPurchaseCreate(
        date=date(2025, 7, 2), kg=2000.0, price_per_kg=0.5, total_cost=1000.0,
    ))

    purchases = await svc.list_purchases()
    assert len(purchases) == 2


@patch("src.services.feed_service.invalidate_prefix", new_callable=AsyncMock)
async def test_soft_delete_purchase(mock_cache, db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FeedService(db_session, user.organization_id, user.id)

    purchase = await svc.create_purchase(FeedPurchaseCreate(
        date=date(2025, 7, 5), kg=500.0, price_per_kg=0.4, total_cost=200.0,
    ))
    await svc.delete_purchase(purchase.id)

    purchases = await svc.list_purchases()
    assert len(purchases) == 0


@patch("src.services.feed_service.invalidate_prefix", new_callable=AsyncMock)
async def test_create_consumption(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = FeedService(db_session, user.organization_id, user.id)

    data = FeedConsumptionCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 1),
        feed_kg=120.5,
    )
    consumption = await svc.create_consumption(data)

    assert consumption.feed_kg == 120.5
    assert consumption.organization_id == user.organization_id


@patch("src.services.feed_service.invalidate_prefix", new_callable=AsyncMock)
async def test_update_consumption(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = FeedService(db_session, user.organization_id, user.id)

    consumption = await svc.create_consumption(FeedConsumptionCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 3),
        feed_kg=100.0,
    ))

    updated = await svc.update_consumption(
        consumption.id, FeedConsumptionUpdate(feed_kg=115.0)
    )
    assert updated.feed_kg == 115.0
