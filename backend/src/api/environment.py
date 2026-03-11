import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.environment import (
    EnvironmentReadingCreate,
    EnvironmentReadingRead,
    EnvironmentReadingUpdate,
    IoTReadingCreate,
    IoTReadingRead,
    IoTReadingUpdate,
    WeatherCacheCreate,
    WeatherCacheRead,
    WeatherCacheUpdate,
)
from src.services.environment_service import EnvironmentService

router = APIRouter(tags=["environment"])

# --- Environment Readings ---


@router.get("/environment", response_model=list[EnvironmentReadingRead])
async def list_environment(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.list_environment(page=page, size=size)


@router.get("/environment/{item_id}", response_model=EnvironmentReadingRead)
async def get_environment(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.get_environment(item_id)


@router.post(
    "/environment",
    response_model=EnvironmentReadingRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_environment(
    data: EnvironmentReadingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.create_environment(data)


@router.put("/environment/{item_id}", response_model=EnvironmentReadingRead)
async def update_environment(
    item_id: uuid.UUID,
    data: EnvironmentReadingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.update_environment(item_id, data)


@router.delete("/environment/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_environment(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    await svc.delete_environment(item_id)


# --- IoT Readings ---


@router.get("/iot-readings", response_model=list[IoTReadingRead])
async def list_iot(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.list_iot(page=page, size=size)


@router.get("/iot-readings/{item_id}", response_model=IoTReadingRead)
async def get_iot(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.get_iot(item_id)


@router.post(
    "/iot-readings", response_model=IoTReadingRead, status_code=status.HTTP_201_CREATED
)
async def create_iot(
    data: IoTReadingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.create_iot(data)


@router.put("/iot-readings/{item_id}", response_model=IoTReadingRead)
async def update_iot(
    item_id: uuid.UUID,
    data: IoTReadingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.update_iot(item_id, data)


@router.delete("/iot-readings/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_iot(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    await svc.delete_iot(item_id)


# --- Weather ---


@router.get("/weather", response_model=list[WeatherCacheRead])
async def list_weather(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.list_weather(page=page, size=size)


@router.get("/weather/{item_id}", response_model=WeatherCacheRead)
async def get_weather(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.get_weather(item_id)


@router.post(
    "/weather", response_model=WeatherCacheRead, status_code=status.HTTP_201_CREATED
)
async def create_weather(
    data: WeatherCacheCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.create_weather(data)


@router.put("/weather/{item_id}", response_model=WeatherCacheRead)
async def update_weather(
    item_id: uuid.UUID,
    data: WeatherCacheUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    return await svc.update_weather(item_id, data)


@router.delete("/weather/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_weather(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = EnvironmentService(db, user.organization_id, user.id)
    await svc.delete_weather(item_id)
