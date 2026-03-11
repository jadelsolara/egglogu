import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.health import (
    MedicationCreate,
    MedicationRead,
    MedicationUpdate,
    OutbreakCreate,
    OutbreakRead,
    OutbreakUpdate,
    StressEventCreate,
    StressEventRead,
    StressEventUpdate,
    VaccineCreate,
    VaccineRead,
    VaccineUpdate,
)
from src.services.health_service import HealthService

router = APIRouter(tags=["health"])

# --- Vaccines ---


@router.get("/vaccines", response_model=list[VaccineRead])
async def list_vaccines(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.list_vaccines(page=page, size=size)


@router.get("/vaccines/{item_id}", response_model=VaccineRead)
async def get_vaccine(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.get_vaccine(item_id)


@router.post(
    "/vaccines", response_model=VaccineRead, status_code=status.HTTP_201_CREATED
)
async def create_vaccine(
    data: VaccineCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.create_vaccine(data)


@router.put("/vaccines/{item_id}", response_model=VaccineRead)
async def update_vaccine(
    item_id: uuid.UUID,
    data: VaccineUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.update_vaccine(item_id, data)


@router.delete("/vaccines/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vaccine(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    await svc.delete_vaccine(item_id)


# --- Medications ---


@router.get("/medications", response_model=list[MedicationRead])
async def list_medications(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.list_medications(page=page, size=size)


@router.get("/medications/{item_id}", response_model=MedicationRead)
async def get_medication(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.get_medication(item_id)


@router.post(
    "/medications", response_model=MedicationRead, status_code=status.HTTP_201_CREATED
)
async def create_medication(
    data: MedicationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.create_medication(data)


@router.put("/medications/{item_id}", response_model=MedicationRead)
async def update_medication(
    item_id: uuid.UUID,
    data: MedicationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.update_medication(item_id, data)


@router.delete("/medications/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    await svc.delete_medication(item_id)


# --- Outbreaks ---


@router.get("/outbreaks", response_model=list[OutbreakRead])
async def list_outbreaks(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.list_outbreaks(page=page, size=size)


@router.get("/outbreaks/{item_id}", response_model=OutbreakRead)
async def get_outbreak(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.get_outbreak(item_id)


@router.post(
    "/outbreaks", response_model=OutbreakRead, status_code=status.HTTP_201_CREATED
)
async def create_outbreak(
    data: OutbreakCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.create_outbreak(data)


@router.put("/outbreaks/{item_id}", response_model=OutbreakRead)
async def update_outbreak(
    item_id: uuid.UUID,
    data: OutbreakUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.update_outbreak(item_id, data)


@router.delete("/outbreaks/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outbreak(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    await svc.delete_outbreak(item_id)


# --- Stress Events ---


@router.get("/stress-events", response_model=list[StressEventRead])
async def list_stress_events(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.list_stress_events(page=page, size=size)


@router.get("/stress-events/{item_id}", response_model=StressEventRead)
async def get_stress_event(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.get_stress_event(item_id)


@router.post(
    "/stress-events",
    response_model=StressEventRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_stress_event(
    data: StressEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.create_stress_event(data)


@router.put("/stress-events/{item_id}", response_model=StressEventRead)
async def update_stress_event(
    item_id: uuid.UUID,
    data: StressEventUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.update_stress_event(item_id, data)


@router.delete("/stress-events/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stress_event(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = HealthService(db, user.organization_id, user.id)
    await svc.delete_stress_event(item_id)


# --- Global Outbreak Alerts (geo-filtered by farm proximity) ---


@router.get("/outbreak-alerts")
async def get_outbreak_alerts_for_my_farms(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = HealthService(db, user.organization_id, user.id)
    return await svc.get_outbreak_alerts()
