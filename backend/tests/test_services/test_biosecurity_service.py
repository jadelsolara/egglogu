"""Tests para BiosecurityService — Visitantes, zonas, plagas, protocolos."""

import uuid
from datetime import date

import pytest

from src.schemas.biosecurity import (
    BiosecurityProtocolCreate,
    BiosecurityVisitorCreate,
    BiosecurityVisitorUpdate,
    BiosecurityZoneCreate,
    PestSightingCreate,
)
from src.services.biosecurity_service import BiosecurityService

pytestmark = pytest.mark.asyncio


async def test_create_visitor(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    data = BiosecurityVisitorCreate(
        date=date(2025, 7, 1),
        name="Carlos Veterinario",
        company="VetCorp",
        purpose="Inspección sanitaria",
        disinfected=True,
    )
    visitor = await svc.create_visitor(data)

    assert visitor.name == "Carlos Veterinario"
    assert visitor.disinfected is True
    assert visitor.organization_id == user.organization_id


async def test_list_visitors(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    await svc.create_visitor(BiosecurityVisitorCreate(
        date=date(2025, 7, 1), name="Visitante A",
    ))
    await svc.create_visitor(BiosecurityVisitorCreate(
        date=date(2025, 7, 2), name="Visitante B",
    ))

    visitors = await svc.list_visitors()
    assert len(visitors) == 2


async def test_update_visitor(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    visitor = await svc.create_visitor(BiosecurityVisitorCreate(
        date=date(2025, 7, 1), name="Sin desinfectar",
    ))
    updated = await svc.update_visitor(
        visitor.id, BiosecurityVisitorUpdate(disinfected=True)
    )
    assert updated.disinfected is True


async def test_create_zone(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    data = BiosecurityZoneCreate(name="Zona Roja", risk_level="red")
    zone = await svc.create_zone(data)

    assert zone.name == "Zona Roja"
    assert zone.risk_level == "red"


async def test_create_pest(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    data = PestSightingCreate(
        date=date(2025, 7, 10),
        type="rodent",
        location="Galpón 2",
        severity=3,
    )
    pest = await svc.create_pest(data)
    assert pest.type == "rodent"
    assert pest.severity == 3


async def test_create_protocol(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    data = BiosecurityProtocolCreate(
        name="Desinfección semanal",
        frequency="weekly",
    )
    protocol = await svc.create_protocol(data)
    assert protocol.name == "Desinfección semanal"
    assert protocol.frequency == "weekly"


async def test_delete_visitor(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = BiosecurityService(db_session, user.organization_id, user.id)

    visitor = await svc.create_visitor(BiosecurityVisitorCreate(
        date=date(2025, 7, 1), name="Temporal",
    ))
    await svc.delete_visitor(visitor.id)

    visitors = await svc.list_visitors()
    assert len(visitors) == 0
