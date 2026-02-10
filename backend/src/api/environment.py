import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.environment import EnvironmentReading, IoTReading, WeatherCache
from src.schemas.environment import (
    EnvironmentReadingCreate, EnvironmentReadingRead, EnvironmentReadingUpdate,
    IoTReadingCreate, IoTReadingRead, IoTReadingUpdate,
    WeatherCacheCreate, WeatherCacheRead, WeatherCacheUpdate,
)

router = APIRouter(tags=["environment"])

# --- Environment Readings ---

@router.get("/environment", response_model=list[EnvironmentReadingRead])
async def list_environment(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(EnvironmentReading).where(EnvironmentReading.organization_id == user.organization_id))
    return result.scalars().all()


@router.get("/environment/{item_id}", response_model=EnvironmentReadingRead)
async def get_environment(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(EnvironmentReading).where(EnvironmentReading.id == item_id, EnvironmentReading.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Environment reading not found")
    return item


@router.post("/environment", response_model=EnvironmentReadingRead, status_code=status.HTTP_201_CREATED)
async def create_environment(data: EnvironmentReadingCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = EnvironmentReading(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/environment/{item_id}", response_model=EnvironmentReadingRead)
async def update_environment(item_id: uuid.UUID, data: EnvironmentReadingUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(EnvironmentReading).where(EnvironmentReading.id == item_id, EnvironmentReading.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Environment reading not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/environment/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_environment(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(EnvironmentReading).where(EnvironmentReading.id == item_id, EnvironmentReading.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Environment reading not found")
    await db.delete(item)

# --- IoT Readings ---

@router.get("/iot-readings", response_model=list[IoTReadingRead])
async def list_iot(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(IoTReading).where(IoTReading.organization_id == user.organization_id))
    return result.scalars().all()


@router.get("/iot-readings/{item_id}", response_model=IoTReadingRead)
async def get_iot(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(IoTReading).where(IoTReading.id == item_id, IoTReading.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("IoT reading not found")
    return item


@router.post("/iot-readings", response_model=IoTReadingRead, status_code=status.HTTP_201_CREATED)
async def create_iot(data: IoTReadingCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = IoTReading(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/iot-readings/{item_id}", response_model=IoTReadingRead)
async def update_iot(item_id: uuid.UUID, data: IoTReadingUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(IoTReading).where(IoTReading.id == item_id, IoTReading.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("IoT reading not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/iot-readings/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_iot(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(IoTReading).where(IoTReading.id == item_id, IoTReading.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("IoT reading not found")
    await db.delete(item)

# --- Weather ---

@router.get("/weather", response_model=list[WeatherCacheRead])
async def list_weather(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(WeatherCache).where(WeatherCache.organization_id == user.organization_id))
    return result.scalars().all()


@router.get("/weather/{item_id}", response_model=WeatherCacheRead)
async def get_weather(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(WeatherCache).where(WeatherCache.id == item_id, WeatherCache.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Weather cache not found")
    return item


@router.post("/weather", response_model=WeatherCacheRead, status_code=status.HTTP_201_CREATED)
async def create_weather(data: WeatherCacheCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = WeatherCache(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/weather/{item_id}", response_model=WeatherCacheRead)
async def update_weather(item_id: uuid.UUID, data: WeatherCacheUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(WeatherCache).where(WeatherCache.id == item_id, WeatherCache.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Weather cache not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/weather/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_weather(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(WeatherCache).where(WeatherCache.id == item_id, WeatherCache.organization_id == user.organization_id))
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Weather cache not found")
    await db.delete(item)
