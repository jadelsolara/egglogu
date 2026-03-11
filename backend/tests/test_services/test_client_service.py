"""Tests para ClientService — CRUD de clientes con soft delete."""

import uuid

import pytest

from src.schemas.client import ClientCreate, ClientUpdate
from src.services.client_service import ClientService

pytestmark = pytest.mark.asyncio


async def test_create_client(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = ClientService(db_session, user.organization_id, user.id)

    data = ClientCreate(name="Supermercado Central", phone="+56912345678")
    client = await svc.create_client(data)

    assert client.name == "Supermercado Central"
    assert client.organization_id == user.organization_id


async def test_list_clients(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = ClientService(db_session, user.organization_id, user.id)

    await svc.create_client(ClientCreate(name="Cliente A"))
    await svc.create_client(ClientCreate(name="Cliente B"))

    clients = await svc.list_clients()
    assert len(clients) == 2


async def test_update_client(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = ClientService(db_session, user.organization_id, user.id)

    client = await svc.create_client(ClientCreate(name="Nombre Viejo"))
    updated = await svc.update_client(client.id, ClientUpdate(name="Nombre Nuevo"))

    assert updated.name == "Nombre Nuevo"


async def test_soft_delete_client(db_session, authenticated_user):
    """El borrado de clientes es soft delete (deleted_at), no hard delete."""
    user = authenticated_user["user"]
    svc = ClientService(db_session, user.organization_id, user.id)

    client = await svc.create_client(ClientCreate(name="Cliente Temporal"))
    await svc.delete_client(client.id)

    # Soft delete: _scoped filtra deleted_at != None
    clients = await svc.list_clients()
    assert len(clients) == 0


async def test_get_client_not_found(db_session, authenticated_user):
    user = authenticated_user["user"]
    svc = ClientService(db_session, user.organization_id, user.id)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await svc.get_client(uuid.uuid4())
    assert exc_info.value.status_code == 404
