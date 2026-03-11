import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.cost_center import (
    CostCenterCreate,
    CostCenterUpdate,
    CostCenterRead,
    CostAllocationCreate,
    CostAllocationUpdate,
    CostAllocationRead,
    ProfitLossSnapshotCreate,
    ProfitLossSnapshotRead,
)
from src.services.cost_centers_service import CostCentersService

router = APIRouter(prefix="/cost-centers", tags=["cost-centers"])


def _svc(db: AsyncSession, user: User) -> CostCentersService:
    return CostCentersService(db, user.organization_id, user.id)


# ── Cost Centers ──
@router.get("", response_model=list[CostCenterRead])
async def list_cost_centers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    center_type: str = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.list_cost_centers(center_type=center_type, page=page, size=size)


@router.post("", response_model=CostCenterRead, status_code=status.HTTP_201_CREATED)
async def create_cost_center(
    data: CostCenterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.create_cost_center(data)


@router.get("/{center_id}", response_model=CostCenterRead)
async def get_cost_center(
    center_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.get_cost_center(center_id)


@router.put("/{center_id}", response_model=CostCenterRead)
async def update_cost_center(
    center_id: uuid.UUID,
    data: CostCenterUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.update_cost_center(center_id, data)


# ── Cost Allocations ──
@router.get("/{center_id}/allocations", response_model=list[CostAllocationRead])
async def list_allocations(
    center_id: uuid.UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    category: str = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.list_allocations(center_id, category=category, page=page, size=size)


@router.post(
    "/allocations",
    response_model=CostAllocationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_allocation(
    data: CostAllocationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.create_allocation(data)


@router.put("/allocations/{alloc_id}", response_model=CostAllocationRead)
async def update_allocation(
    alloc_id: uuid.UUID,
    data: CostAllocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.update_allocation(alloc_id, data)


# ── P&L Snapshots ──
@router.get("/{center_id}/pl", response_model=list[ProfitLossSnapshotRead])
async def list_pl_snapshots(
    center_id: uuid.UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.list_pl_snapshots(center_id, page=page, size=size)


@router.post(
    "/{center_id}/pl",
    response_model=ProfitLossSnapshotRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_pl_snapshot(
    center_id: uuid.UUID,
    data: ProfitLossSnapshotCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.create_pl_snapshot(center_id, data)


# ── Summary endpoint: all centers with latest P&L ──
@router.get("/summary/overview")
async def cost_center_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    svc = _svc(db, user)
    return await svc.overview()
