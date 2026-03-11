"""CostCentersService — Cost centers, allocations, P&L snapshots."""

import uuid

from sqlalchemy import func, select

from src.core.exceptions import NotFoundError
from src.models.cost_center import CostCenter, CostAllocation, ProfitLossSnapshot
from src.schemas.cost_center import (
    CostCenterCreate,
    CostCenterUpdate,
    CostAllocationCreate,
    CostAllocationUpdate,
    ProfitLossSnapshotCreate,
)
from src.services.base import BaseService


class CostCentersService(BaseService):
    """Tenant-scoped cost center operations."""

    # ── Cost Centers ──────────────────────────────────────────────

    async def list_cost_centers(
        self,
        *,
        center_type: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = select(CostCenter).where(CostCenter.organization_id == self.org_id)
        if center_type:
            stmt = stmt.where(CostCenter.center_type == center_type)
        stmt = stmt.order_by(CostCenter.id).offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_cost_center(self, data: CostCenterCreate) -> CostCenter:
        obj = CostCenter(**data.model_dump(), organization_id=self.org_id)
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def get_cost_center(self, center_id: uuid.UUID) -> CostCenter:
        result = await self.db.execute(
            select(CostCenter).where(
                CostCenter.id == center_id,
                CostCenter.organization_id == self.org_id,
            )
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError("Cost center not found")
        return obj

    async def update_cost_center(
        self, center_id: uuid.UUID, data: CostCenterUpdate
    ) -> CostCenter:
        obj = await self.get_cost_center(center_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        await self.db.flush()
        return obj

    # ── Cost Allocations ──────────────────────────────────────────

    async def list_allocations(
        self,
        center_id: uuid.UUID,
        *,
        category: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = (
            select(CostAllocation)
            .where(
                CostAllocation.cost_center_id == center_id,
                CostAllocation.organization_id == self.org_id,
            )
            .order_by(CostAllocation.date.desc())
        )
        if category:
            stmt = stmt.where(CostAllocation.category == category)
        stmt = stmt.offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_allocation(self, data: CostAllocationCreate) -> CostAllocation:
        obj = CostAllocation(**data.model_dump(), organization_id=self.org_id)
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def update_allocation(
        self, alloc_id: uuid.UUID, data: CostAllocationUpdate
    ) -> CostAllocation:
        result = await self.db.execute(
            select(CostAllocation).where(
                CostAllocation.id == alloc_id,
                CostAllocation.organization_id == self.org_id,
            )
        )
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError("Cost allocation not found")
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        await self.db.flush()
        return obj

    # ── P&L Snapshots ─────────────────────────────────────────────

    async def list_pl_snapshots(
        self,
        center_id: uuid.UUID,
        *,
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = (
            select(ProfitLossSnapshot)
            .where(
                ProfitLossSnapshot.cost_center_id == center_id,
                ProfitLossSnapshot.organization_id == self.org_id,
            )
            .order_by(ProfitLossSnapshot.period_start.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_pl_snapshot(
        self, center_id: uuid.UUID, data: ProfitLossSnapshotCreate
    ) -> ProfitLossSnapshot:
        gross_profit = data.total_revenue - data.total_cost
        margin_pct = (
            (gross_profit / data.total_revenue * 100) if data.total_revenue > 0 else 0.0
        )
        cost_per_unit = (
            (data.total_cost / data.units_produced) if data.units_produced else None
        )
        # Standard unit multiplier: dozen for eggs, 1 for kg/liters/tonnes
        std_multiplier = 12 if (data.unit_of_measure or "units") == "units" else 1
        cost_per_standard = (cost_per_unit * std_multiplier) if cost_per_unit else None

        obj = ProfitLossSnapshot(
            cost_center_id=center_id,
            organization_id=self.org_id,
            period_start=data.period_start,
            period_end=data.period_end,
            total_revenue=data.total_revenue,
            total_cost=data.total_cost,
            gross_profit=gross_profit,
            margin_pct=round(margin_pct, 2),
            units_produced=data.units_produced,
            units_sold=data.units_sold,
            cost_per_unit=round(cost_per_unit, 4) if cost_per_unit else None,
            cost_per_standard_unit=(
                round(cost_per_standard, 4) if cost_per_standard else None
            ),
            unit_of_measure=data.unit_of_measure,
            notes=data.notes,
        )
        self.db.add(obj)
        await self.db.flush()
        return obj

    # ── Summary overview ──────────────────────────────────────────

    async def overview(self) -> list[dict]:
        centers_result = await self.db.execute(
            select(CostCenter).where(
                CostCenter.organization_id == self.org_id,
                CostCenter.is_active.is_(True),
            )
        )
        centers = centers_result.scalars().all()

        overview = []
        for center in centers:
            cost_result = await self.db.execute(
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
                    "center_type": (
                        center.center_type.value
                        if hasattr(center.center_type, "value")
                        else center.center_type
                    ),
                    "budget_monthly": center.budget_monthly,
                    "total_allocated": total_allocated,
                    "budget_utilization_pct": (
                        round(total_allocated / center.budget_monthly * 100, 1)
                        if center.budget_monthly and center.budget_monthly > 0
                        else None
                    ),
                }
            )
        return overview
