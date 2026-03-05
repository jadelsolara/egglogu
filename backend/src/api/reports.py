import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError, ForbiddenError
from src.core.plans import get_plan_limits
from src.database import get_db
from src.models.auth import User
from src.models.report import ReportSchedule, ReportExecution
from src.schemas.report import (
    ReportScheduleCreate,
    ReportScheduleRead,
    ReportScheduleUpdate,
    ReportExecutionRead,
    ReportGenerateRequest,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _check_report_access(user: User, template: str) -> None:
    """Validate plan-level access to report features."""
    limits = get_plan_limits(user.plan)
    report_cfg = limits.get("reports", {})
    if not report_cfg:
        raise ForbiddenError(
            "Reports require Starter plan or higher. Upgrade to access."
        )
    allowed = report_cfg.get("templates", [])
    if allowed != "all" and template not in allowed:
        raise ForbiddenError(
            f"Report template '{template}' not available on your plan. Upgrade to access."
        )


def _check_scheduling_access(user: User, frequency: str) -> None:
    """Validate plan-level access to scheduled reports."""
    limits = get_plan_limits(user.plan)
    report_cfg = limits.get("reports", {})
    scheduling = report_cfg.get("scheduling", [])
    if not scheduling:
        raise ForbiddenError(
            "Scheduled reports require Pro plan or higher. Upgrade to access."
        )
    if scheduling != "all" and frequency not in scheduling:
        raise ForbiddenError(
            f"Frequency '{frequency}' not available on your plan. Upgrade to access."
        )


# ── GET /reports/schedules ──
@router.get("/schedules", response_model=list[ReportScheduleRead])
async def list_schedules(
    farm_id: uuid.UUID = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ReportSchedule)
        .where(
            ReportSchedule.organization_id == user.organization_id,
            ReportSchedule.farm_id == farm_id,
        )
        .order_by(ReportSchedule.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ── POST /reports/schedules ──
@router.post(
    "/schedules",
    response_model=ReportScheduleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_schedule(
    data: ReportScheduleCreate,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    _check_report_access(user, data.template)
    _check_scheduling_access(user, data.frequency)

    # Check schedule limit per plan
    limits = get_plan_limits(user.plan)
    report_cfg = limits.get("reports", {})
    max_schedules = report_cfg.get("max_schedules")
    if max_schedules is not None:
        count_stmt = select(func.count()).where(
            ReportSchedule.organization_id == user.organization_id,
            ReportSchedule.farm_id == data.farm_id,
        )
        count = (await db.execute(count_stmt)).scalar() or 0
        if count >= max_schedules:
            raise ForbiddenError(
                f"Limit reached: max {max_schedules} report schedules. Upgrade your plan."
            )

    obj = ReportSchedule(
        **data.model_dump(),
        organization_id=user.organization_id,
        created_by=user.id,
    )
    db.add(obj)
    await db.flush()
    return obj


# ── GET /reports/schedules/{schedule_id} ──
@router.get("/schedules/{schedule_id}", response_model=ReportScheduleRead)
async def get_schedule(
    schedule_id: uuid.UUID,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ReportSchedule).where(
        ReportSchedule.id == schedule_id,
        ReportSchedule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Report schedule not found")
    return obj


# ── PUT /reports/schedules/{schedule_id} ──
@router.put("/schedules/{schedule_id}", response_model=ReportScheduleRead)
async def update_schedule(
    schedule_id: uuid.UUID,
    data: ReportScheduleUpdate,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ReportSchedule).where(
        ReportSchedule.id == schedule_id,
        ReportSchedule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Report schedule not found")

    update_data = data.model_dump(exclude_unset=True)
    if "template" in update_data:
        _check_report_access(user, update_data["template"])
    if "frequency" in update_data:
        _check_scheduling_access(user, update_data["frequency"])

    for key, value in update_data.items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ── DELETE /reports/schedules/{schedule_id} ──
@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ReportSchedule).where(
        ReportSchedule.id == schedule_id,
        ReportSchedule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Report schedule not found")
    await db.delete(obj)
    await db.flush()


# ── POST /reports/schedules/{schedule_id}/send ──
@router.post("/schedules/{schedule_id}/send", response_model=ReportExecutionRead)
async def send_scheduled_report(
    schedule_id: uuid.UUID,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ReportSchedule).where(
        ReportSchedule.id == schedule_id,
        ReportSchedule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise NotFoundError("Report schedule not found")

    from src.core.report_generator import execute_report

    execution = await execute_report(db, schedule, user)
    return execution


# ── GET /reports/executions ──
@router.get("/executions", response_model=list[ReportExecutionRead])
async def list_executions(
    farm_id: uuid.UUID = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ReportExecution)
        .where(
            ReportExecution.organization_id == user.organization_id,
            ReportExecution.farm_id == farm_id,
        )
        .order_by(ReportExecution.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# ── POST /reports/generate (ad-hoc, no schedule) ──
@router.post(
    "/generate",
    response_model=ReportExecutionRead,
    status_code=status.HTTP_201_CREATED,
)
async def generate_report(
    data: ReportGenerateRequest,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    _check_report_access(user, data.template)

    from src.core.report_generator import generate_adhoc_report

    execution = await generate_adhoc_report(db, data, user)
    return execution
