import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.compliance import (
    CertificationCreate,
    CertificationUpdate,
    CertificationRead,
    InspectionCreate,
    InspectionUpdate,
    InspectionRead,
    SalmonellaTestCreate,
    SalmonellaTestUpdate,
    SalmonellaTestRead,
)
from src.services.compliance_service import ComplianceService

router = APIRouter(prefix="/compliance", tags=["compliance"])


# ── Certifications ──
@router.get("/certifications", response_model=list[CertificationRead])
async def list_certifications(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    """Lista certificaciones de la organización."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.list_certifications(page=page, size=size)


@router.post(
    "/certifications",
    response_model=CertificationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_certification(
    data: CertificationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    """Crea una nueva certificación."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.create_certification(data)


@router.put("/certifications/{cert_id}", response_model=CertificationRead)
async def update_certification(
    cert_id: uuid.UUID,
    data: CertificationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    """Actualiza una certificación existente."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.update_certification(cert_id, data)


# ── Inspections ──
@router.get("/inspections", response_model=list[InspectionRead])
async def list_inspections(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    """Lista inspecciones de la organización."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.list_inspections(page=page, size=size)


@router.post(
    "/inspections", response_model=InspectionRead, status_code=status.HTTP_201_CREATED
)
async def create_inspection(
    data: InspectionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    """Crea una nueva inspección."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.create_inspection(data)


@router.put("/inspections/{insp_id}", response_model=InspectionRead)
async def update_inspection(
    insp_id: uuid.UUID,
    data: InspectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("biosecurity")),
):
    """Actualiza una inspección existente."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.update_inspection(insp_id, data)


# ── Salmonella Tests ──
@router.get("/salmonella", response_model=list[SalmonellaTestRead])
async def list_salmonella_tests(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("health")),
):
    """Lista tests de salmonella de la organización."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.list_salmonella_tests(page=page, size=size)


@router.post(
    "/salmonella",
    response_model=SalmonellaTestRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_salmonella_test(
    data: SalmonellaTestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("health")),
):
    """Crea un nuevo test de salmonella."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.create_salmonella_test(data)


@router.put("/salmonella/{test_id}", response_model=SalmonellaTestRead)
async def update_salmonella_test(
    test_id: uuid.UUID,
    data: SalmonellaTestUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("health")),
):
    """Actualiza un test de salmonella existente."""
    svc = ComplianceService(db, user.organization_id, user.id)
    return await svc.update_salmonella_test(test_id, data)
