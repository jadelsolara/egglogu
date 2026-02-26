import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.cost_center import (
    CostCenter,
    CostAllocation,
    ProfitLossSnapshot,
)
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

router = APIRouter(prefix="/cost-centers", tags=["cost-centers"])


# ── Cost Centers ──
@router.get("", response_model=list[CostCenterRead])
async def list_cost_centers(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    center_type: str = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    stmt = select(CostCenter).where(CostCenter.organization_id == user.organization_id)
    if center_type:
        stmt = stmt.where(CostCenter.center_type == center_type)
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=CostCenterRead, status_code=status.HTTP_201_CREATED)
async def create_cost_center(
    data: CostCenterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    obj = CostCenter(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.get("/{center_id}", response_model=CostCenterRead)
async def get_cost_center(
    center_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    result = await db.execute(
        select(CostCenter).where(
            CostCenter.id == center_id,
            CostCenter.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Cost center not found")
    return obj


@router.put("/{center_id}", response_model=CostCenterRead)
async def update_cost_center(
    center_id: uuid.UUID,
    data: CostCenterUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    result = await db.execute(
        select(CostCenter).where(
            CostCenter.id == center_id,
            CostCenter.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Cost center not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


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
    stmt = (
        select(CostAllocation)
        .where(
            CostAllocation.cost_center_id == center_id,
            CostAllocation.organization_id == user.organization_id,
        )
        .order_by(CostAllocation.date.desc())
    )
    if category:
        stmt = stmt.where(CostAllocation.category == category)
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


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
    obj = CostAllocation(**data.model_dump(), organization_id=user.organization_id)
    db.add(obj)
    await db.flush()
    return obj


@router.put("/allocations/{alloc_id}", response_model=CostAllocationRead)
async def update_allocation(
    alloc_id: uuid.UUID,
    data: CostAllocationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    result = await db.execute(
        select(CostAllocation).where(
            CostAllocation.id == alloc_id,
            CostAllocation.organization_id == user.organization_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Cost allocation not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ── P&L Snapshots ──
@router.get("/{center_id}/pl", response_model=list[ProfitLossSnapshotRead])
async def list_pl_snapshots(
    center_id: uuid.UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    stmt = (
        select(ProfitLossSnapshot)
        .where(
            ProfitLossSnapshot.cost_center_id == center_id,
            ProfitLossSnapshot.organization_id == user.organization_id,
        )
        .order_by(ProfitLossSnapshot.period_start.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


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
    gross_profit = data.total_revenue - data.total_cost
    margin_pct = (
        (gross_profit / data.total_revenue * 100) if data.total_revenue > 0 else 0.0
    )
    cost_per_egg = (
        (data.total_cost / data.eggs_produced) if data.eggs_produced else None
    )
    cost_per_dozen = (cost_per_egg * 12) if cost_per_egg else None

    obj = ProfitLossSnapshot(
        cost_center_id=center_id,
        organization_id=user.organization_id,
        period_start=data.period_start,
        period_end=data.period_end,
        total_revenue=data.total_revenue,
        total_cost=data.total_cost,
        gross_profit=gross_profit,
        margin_pct=round(margin_pct, 2),
        eggs_produced=data.eggs_produced,
        eggs_sold=data.eggs_sold,
        cost_per_egg=round(cost_per_egg, 4) if cost_per_egg else None,
        cost_per_dozen=round(cost_per_dozen, 4) if cost_per_dozen else None,
        notes=data.notes,
    )
    db.add(obj)
    await db.flush()
    return obj


# ── Summary endpoint: all centers with latest P&L ──
@router.get("/summary/overview")
async def cost_center_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature("finance")),
):
    centers_result = await db.execute(
        select(CostCenter).where(
            CostCenter.organization_id == user.organization_id,
            CostCenter.is_active.is_(True),
        )
    )
    centers = centers_result.scalars().all()

    overview = []
    for center in centers:
        # Get total allocated costs
        cost_result = await db.execute(
            select(func.sum(CostAllocation.amount)).where(
                CostAllocation.cost_center_id == center.id
            )
        )
        total_allocated = cost_result.scalar() or 0.0

        overview.append(
            {
                "id": str(center.id),
                "name": center.name,
                "code": center.code,
                "center_type": center.center_type.value
                if hasattr(center.center_type, "value")
                else center.center_type,
                "budget_monthly": center.budget_monthly,
                "total_allocated": total_allocated,
                "budget_utilization_pct": round(
                    (total_allocated / center.budget_monthly * 100), 1
                )
                if center.budget_monthly and center.budget_monthly > 0
                else None,
            }
        )
    return overview
