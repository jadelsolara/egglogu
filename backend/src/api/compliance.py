import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.compliance import (
    ComplianceCertification, ComplianceInspection, SalmonellaTest,
)
from src.schemas.compliance import (
    CertificationCreate, CertificationUpdate, CertificationRead,
    InspectionCreate, InspectionUpdate, InspectionRead,
    SalmonellaTestCreate, SalmonellaTestUpdate, SalmonellaTestRead,
)

router = APIRouter(prefix="/compliance", tags=["compliance"])

# ── Certifications ──
@router.get("/certifications", response_model=list[CertificationRead])
async def list_certifications(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    stmt = (
        select(ComplianceCertification)
        .where(ComplianceCertification.organization_id == user.organization_id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/certifications", response_model=CertificationRead, status_code=status.HTTP_201_CREATED)
async def create_certification(
    data: CertificationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    obj = ComplianceCertification(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj

@router.put("/certifications/{cert_id}", response_model=CertificationRead)
async def update_certification(
    cert_id: uuid.UUID,
    data: CertificationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(ComplianceCertification).where(
            ComplianceCertification.id == cert_id,
            ComplianceCertification.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Certification not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj

# ── Inspections ──
@router.get("/inspections", response_model=list[InspectionRead])
async def list_inspections(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    stmt = (
        select(ComplianceInspection)
        .where(ComplianceInspection.organization_id == user.organization_id)
        .order_by(ComplianceInspection.scheduled_date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/inspections", response_model=InspectionRead, status_code=status.HTTP_201_CREATED)
async def create_inspection(
    data: InspectionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    obj = ComplianceInspection(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj

@router.put("/inspections/{insp_id}", response_model=InspectionRead)
async def update_inspection(
    insp_id: uuid.UUID,
    data: InspectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    result = await db.execute(
        select(ComplianceInspection).where(
            ComplianceInspection.id == insp_id,
            ComplianceInspection.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Inspection not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj

# ── Salmonella Tests ──
@router.get("/salmonella", response_model=list[SalmonellaTestRead])
async def list_salmonella_tests(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("health")),
):
    stmt = (
        select(SalmonellaTest)
        .where(SalmonellaTest.organization_id == user.organization_id)
        .order_by(SalmonellaTest.sample_date.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/salmonella", response_model=SalmonellaTestRead, status_code=status.HTTP_201_CREATED)
async def create_salmonella_test(
    data: SalmonellaTestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("health")),
):
    obj = SalmonellaTest(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj

@router.put("/salmonella/{test_id}", response_model=SalmonellaTestRead)
async def update_salmonella_test(
    test_id: uuid.UUID,
    data: SalmonellaTestUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("health")),
):
    result = await db.execute(
        select(SalmonellaTest).where(
            SalmonellaTest.id == test_id,
            SalmonellaTest.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Salmonella test not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj
