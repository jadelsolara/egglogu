"""ClientService — Gestión de clientes."""

import uuid

from src.models.client import Client
from src.services.base import BaseService


class ClientService(BaseService):
    async def list_clients(self, *, page: int = 1, size: int = 50) -> list:
        return await self._list(Client, page=page, size=size)

    async def get_client(self, client_id: uuid.UUID) -> Client:
        return await self._get(Client, client_id, error_msg="Client not found")

    async def create_client(self, data) -> Client:
        return await self._create(Client, data)

    async def update_client(self, client_id: uuid.UUID, data) -> Client:
        return await self._update(Client, client_id, data, error_msg="Client not found")

    async def delete_client(self, client_id: uuid.UUID) -> None:
        await self._soft_delete(Client, client_id, error_msg="Client not found")
