"""Tests para HealthService — Vacunas, medicamentos, brotes, estrés."""

import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from src.schemas.health import (
    MedicationCreate,
    OutbreakCreate,
    StressEventCreate,
    VaccineCreate,
    VaccineUpdate,
)
from src.services.health_service import HealthService

pytestmark = pytest.mark.asyncio


@patch("src.services.health_service.invalidate_prefix", new_callable=AsyncMock)
async def test_create_vaccine(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = HealthService(db_session, user.organization_id, user.id)

    data = VaccineCreate(
        flock_id=sample_flock.id,
        date=date(2025, 6, 15),
        name="Newcastle B1",
        method="ocular",
        cost=150.0,
    )
    vaccine = await svc.create_vaccine(data)

    assert vaccine.name == "Newcastle B1"
    assert vaccine.organization_id == user.organization_id
    mock_cache.assert_called_once()


@patch("src.services.health_service.invalidate_prefix", new_callable=AsyncMock)
async def test_list_vaccines(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = HealthService(db_session, user.organization_id, user.id)

    await svc.create_vaccine(VaccineCreate(
        flock_id=sample_flock.id, date=date(2025, 6, 1), name="Marek",
    ))
    await svc.create_vaccine(VaccineCreate(
        flock_id=sample_flock.id, date=date(2025, 6, 15), name="Newcastle",
    ))

    vaccines = await svc.list_vaccines()
    assert len(vaccines) == 2


@patch("src.services.health_service.invalidate_prefix", new_callable=AsyncMock)
async def test_update_vaccine(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = HealthService(db_session, user.organization_id, user.id)

    vaccine = await svc.create_vaccine(VaccineCreate(
        flock_id=sample_flock.id, date=date(2025, 6, 1), name="Gumboro",
    ))

    updated = await svc.update_vaccine(vaccine.id, VaccineUpdate(name="Gumboro D78"))
    assert updated.name == "Gumboro D78"


@patch("src.services.health_service.invalidate_prefix", new_callable=AsyncMock)
async def test_create_medication(mock_cache, db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = HealthService(db_session, user.organization_id, user.id)

    data = MedicationCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 1),
        name="Enrofloxacina",
        dosage="10mg/kg",
        duration_days=5,
    )
    med = await svc.create_medication(data)
    assert med.name == "Enrofloxacina"


async def test_create_outbreak(db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = HealthService(db_session, user.organization_id, user.id)

    data = OutbreakCreate(
        flock_id=sample_flock.id,
        date=date(2025, 8, 1),
        disease="Coccidiosis",
        affected_count=200,
        deaths=5,
    )
    outbreak = await svc.create_outbreak(data)
    assert outbreak.disease == "Coccidiosis"
    assert outbreak.affected_count == 200


async def test_create_stress_event(db_session, authenticated_user, sample_flock):
    user = authenticated_user["user"]
    svc = HealthService(db_session, user.organization_id, user.id)

    data = StressEventCreate(
        flock_id=sample_flock.id,
        date=date(2025, 7, 20),
        type="heat",
        severity=7,
        description="Ola de calor extrema",
    )
    event = await svc.create_stress_event(data)
    assert event.type == "heat"
    assert event.severity == 7


def test_haversine_km():
    """Test de la fórmula Haversine."""
    dist = HealthService._haversine_km(-33.45, -70.66, -33.45, -70.66)
    assert dist == 0.0

    dist = HealthService._haversine_km(-33.45, -70.66, -34.60, -71.21)
    assert 100 < dist < 200  # ~135 km aprox
