"""Tests para OperationsService — Checklist, bitácora, personal."""

import uuid
from datetime import date

import pytest

from src.schemas.operations import (
    ChecklistItemCreate,
    ChecklistItemUpdate,
    LogbookEntryCreate,
    PersonnelCreate,
    PersonnelUpdate,
)
from src.services.operations_service import OperationsService

pytestmark = pytest.mark.asyncio


async def test_create_checklist(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    data = ChecklistItemCreate(label="Revisar bebederos")
    item = await svc.create_checklist(data)

    assert item.label == "Revisar bebederos"
    assert item.organization_id == user.organization_id


async def test_list_checklist(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    await svc.create_checklist(ChecklistItemCreate(label="Tarea 1"))
    await svc.create_checklist(ChecklistItemCreate(label="Tarea 2"))

    items = await svc.list_checklist()
    assert len(items) == 2


async def test_soft_delete_checklist(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    item = await svc.create_checklist(ChecklistItemCreate(label="Borrar esto"))
    await svc.delete_checklist(item.id)

    items = await svc.list_checklist()
    assert len(items) == 0


async def test_create_logbook(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    data = LogbookEntryCreate(date=date(2025, 7, 1), text="Limpieza general del galpón 3")
    entry = await svc.create_logbook(data)

    assert entry.text == "Limpieza general del galpón 3"


async def test_delete_logbook(db_session, authenticated_user):
    """Logbook usa hard delete, no soft delete."""
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    entry = await svc.create_logbook(LogbookEntryCreate(
        date=date(2025, 7, 5), text="Entrada temporal",
    ))
    await svc.delete_logbook(entry.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await svc.get_logbook(entry.id)


async def test_create_personnel(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    data = PersonnelCreate(name="Juan Pérez", role_desc="Encargado", salary=800000.0)
    person = await svc.create_personnel(data)

    assert person.name == "Juan Pérez"
    assert person.salary == 800000.0


async def test_update_personnel(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    person = await svc.create_personnel(PersonnelCreate(name="María López"))
    updated = await svc.update_personnel(person.id, PersonnelUpdate(salary=950000.0))

    assert updated.salary == 950000.0
    assert updated.name == "María López"


async def test_soft_delete_personnel(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = OperationsService(db_session, user.organization_id, user.id)

    person = await svc.create_personnel(PersonnelCreate(name="Temporal"))
    await svc.delete_personnel(person.id)

    personnel = await svc.list_personnel()
    assert len(personnel) == 0
