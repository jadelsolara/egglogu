import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.client import Client
from src.schemas.client import ClientCreate, ClientRead, ClientUpdate

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("/", response_model=list[ClientRead])
async def list_clients(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Client)
        .where(Client.organization_id == user.organization_id)
        .order_by(Client.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{client_id}", response_model=ClientRead)
async def get_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(
            Client.id == client_id, Client.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Client not found")
    return item


@router.post("/", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Client(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: uuid.UUID,
    data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(
            Client.id == client_id, Client.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Client not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(
            Client.id == client_id, Client.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Client not found")
    await db.delete(item)
