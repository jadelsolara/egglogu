"""Tests para FarmService — CRUD de granjas."""

import uuid

import pytest

from src.schemas.farm import FarmCreate, FarmUpdate
from src.services.farm_service import FarmService

pytestmark = pytest.mark.asyncio


async def test_create_farm(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    data = FarmCreate(name="Granja Norte", lat=-33.45, lng=-70.66)
    farm = await svc.create_farm(data)

    assert farm.name == "Granja Norte"
    assert farm.organization_id == user.organization_id
    assert farm.lat == -33.45


async def test_list_farms(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    await svc.create_farm(FarmCreate(name="Granja A"))
    await svc.create_farm(FarmCreate(name="Granja B"))

    farms = await svc.list_farms()
    assert len(farms) == 2


async def test_get_farm(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    farm = await svc.create_farm(FarmCreate(name="Granja Test"))
    fetched = await svc.get_farm(farm.id)

    assert fetched.id == farm.id
    assert fetched.name == "Granja Test"


async def test_get_farm_not_found(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await svc.get_farm(uuid.uuid4())
    assert exc_info.value.status_code == 404


async def test_update_farm(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    farm = await svc.create_farm(FarmCreate(name="Granja Vieja"))
    updated = await svc.update_farm(farm.id, FarmUpdate(name="Granja Nueva"))

    assert updated.name == "Granja Nueva"


async def test_delete_farm(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    farm = await svc.create_farm(FarmCreate(name="Granja Temporal"))
    await svc.delete_farm(farm.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await svc.get_farm(farm.id)


async def test_tenant_isolation(db_session, authenticated_user):
    """Una organización no ve granjas de otra."""
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)
    await svc.create_farm(FarmCreate(name="Granja Org1"))

    other_org_id = uuid.uuid4()
    svc_other = FarmService(db_session, other_org_id, uuid.uuid4())
    farms = await svc_other.list_farms()
    assert len(farms) == 0


async def test_pagination(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = FarmService(db_session, user.organization_id, user.id)

    for i in range(5):
        await svc.create_farm(FarmCreate(name=f"Granja {i}"))

    page1 = await svc.list_farms(page=1, size=2)
    page2 = await svc.list_farms(page=2, size=2)
    page3 = await svc.list_farms(page=3, size=2)

    assert len(page1) == 2
    assert len(page2) == 2
    assert len(page3) == 1
