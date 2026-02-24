import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.health import Medication, Outbreak, StressEvent, Vaccine
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

router = APIRouter(tags=["health"])

# --- Vaccines ---


@router.get("/vaccines", response_model=list[VaccineRead])
async def list_vaccines(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(Vaccine).where(Vaccine.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/vaccines/{item_id}", response_model=VaccineRead)
async def get_vaccine(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Vaccine).where(
            Vaccine.id == item_id, Vaccine.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Vaccine not found")
    return item


@router.post(
    "/vaccines", response_model=VaccineRead, status_code=status.HTTP_201_CREATED
)
async def create_vaccine(
    data: VaccineCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Vaccine(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/vaccines/{item_id}", response_model=VaccineRead)
async def update_vaccine(
    item_id: uuid.UUID,
    data: VaccineUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Vaccine).where(
            Vaccine.id == item_id, Vaccine.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Vaccine not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/vaccines/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vaccine(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Vaccine).where(
            Vaccine.id == item_id, Vaccine.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Vaccine not found")
    await db.delete(item)


# --- Medications ---


@router.get("/medications", response_model=list[MedicationRead])
async def list_medications(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(Medication).where(Medication.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/medications/{item_id}", response_model=MedicationRead)
async def get_medication(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Medication).where(
            Medication.id == item_id, Medication.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Medication not found")
    return item


@router.post(
    "/medications", response_model=MedicationRead, status_code=status.HTTP_201_CREATED
)
async def create_medication(
    data: MedicationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Medication(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/medications/{item_id}", response_model=MedicationRead)
async def update_medication(
    item_id: uuid.UUID,
    data: MedicationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Medication).where(
            Medication.id == item_id, Medication.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Medication not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/medications/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Medication).where(
            Medication.id == item_id, Medication.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Medication not found")
    await db.delete(item)


# --- Outbreaks ---


@router.get("/outbreaks", response_model=list[OutbreakRead])
async def list_outbreaks(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(Outbreak).where(Outbreak.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/outbreaks/{item_id}", response_model=OutbreakRead)
async def get_outbreak(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Outbreak).where(
            Outbreak.id == item_id, Outbreak.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Outbreak not found")
    return item


@router.post(
    "/outbreaks", response_model=OutbreakRead, status_code=status.HTTP_201_CREATED
)
async def create_outbreak(
    data: OutbreakCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Outbreak(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/outbreaks/{item_id}", response_model=OutbreakRead)
async def update_outbreak(
    item_id: uuid.UUID,
    data: OutbreakUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Outbreak).where(
            Outbreak.id == item_id, Outbreak.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Outbreak not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/outbreaks/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outbreak(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Outbreak).where(
            Outbreak.id == item_id, Outbreak.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Outbreak not found")
    await db.delete(item)


# --- Stress Events ---


@router.get("/stress-events", response_model=list[StressEventRead])
async def list_stress_events(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(StressEvent).where(StressEvent.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/stress-events/{item_id}", response_model=StressEventRead)
async def get_stress_event(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StressEvent).where(
            StressEvent.id == item_id,
            StressEvent.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Stress event not found")
    return item


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
    item = StressEvent(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/stress-events/{item_id}", response_model=StressEventRead)
async def update_stress_event(
    item_id: uuid.UUID,
    data: StressEventUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StressEvent).where(
            StressEvent.id == item_id,
            StressEvent.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Stress event not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/stress-events/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stress_event(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(StressEvent).where(
            StressEvent.id == item_id,
            StressEvent.organization_id == user.organization_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Stress event not found")
    await db.delete(item)
