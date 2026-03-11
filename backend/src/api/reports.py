import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.report import (
    ReportScheduleCreate,
    ReportScheduleRead,
    ReportScheduleUpdate,
    ReportExecutionRead,
    ReportGenerateRequest,
)
from src.services.reports_service import ReportsService

router = APIRouter(prefix="/reports", tags=["reports"])


# ── GET /reports/schedules ──
@router.get("/schedules", response_model=list[ReportScheduleRead])
async def list_schedules(
    farm_id: uuid.UUID = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.list_schedules(farm_id, page=page, size=size)


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
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.create_schedule(data, user)


# ── GET /reports/schedules/{schedule_id} ──
@router.get("/schedules/{schedule_id}", response_model=ReportScheduleRead)
async def get_schedule(
    schedule_id: uuid.UUID,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.get_schedule(schedule_id)


# ── PUT /reports/schedules/{schedule_id} ──
@router.put("/schedules/{schedule_id}", response_model=ReportScheduleRead)
async def update_schedule(
    schedule_id: uuid.UUID,
    data: ReportScheduleUpdate,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.update_schedule(schedule_id, data, user)


# ── DELETE /reports/schedules/{schedule_id} ──
@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportsService(db, user.organization_id, user.id)
    await svc.delete_schedule(schedule_id)


# ── POST /reports/schedules/{schedule_id}/send ──
@router.post("/schedules/{schedule_id}/send", response_model=ReportExecutionRead)
async def send_scheduled_report(
    schedule_id: uuid.UUID,
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.send_scheduled_report(schedule_id, user)


# ── GET /reports/executions ──
@router.get("/executions", response_model=list[ReportExecutionRead])
async def list_executions(
    farm_id: uuid.UUID = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(require_feature("reports")),
    db: AsyncSession = Depends(get_db),
):
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.list_executions(farm_id, page=page, size=size)


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
    svc = ReportsService(db, user.organization_id, user.id)
    return await svc.generate_adhoc(data, user)
