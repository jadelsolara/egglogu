import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.database import get_db
from src.models.auth import User
from src.schemas.workflow import (
    WorkflowRuleCreate,
    WorkflowRuleRead,
    WorkflowRuleUpdate,
    WorkflowExecutionRead,
)
from src.services.workflows_service import WorkflowsService

router = APIRouter(prefix="/workflows", tags=["workflows"])

# ── 8 preset templates ──
WORKFLOW_PRESETS = [
    {
        "id": "mortality_spike",
        "name": "Mortality Spike Alert",
        "trigger_type": "threshold",
        "conditions": {"type": "mortality_spike", "threshold": 5, "period_hours": 24},
        "actions": {"notify": True, "email_vet": True, "auto_log": True},
        "cooldown_minutes": 360,
    },
    {
        "id": "low_production",
        "name": "Low Production Alert",
        "trigger_type": "threshold",
        "conditions": {"type": "production_drop", "drop_pct": 10, "vs_period_days": 7},
        "actions": {"notify": True},
        "cooldown_minutes": 720,
    },
    {
        "id": "feed_stock_critical",
        "name": "Feed Stock Critical",
        "trigger_type": "threshold",
        "conditions": {"type": "feed_stock_low", "days_remaining": 3},
        "actions": {"notify": True, "auto_task": True},
        "cooldown_minutes": 1440,
    },
    {
        "id": "vaccine_due",
        "name": "Vaccine Due Reminder",
        "trigger_type": "schedule",
        "conditions": {"type": "vaccine_due", "days_ahead": 7},
        "actions": {"notify": True, "email": True},
        "cooldown_minutes": 1440,
    },
    {
        "id": "temperature_alert",
        "name": "Temperature Alert (THI)",
        "trigger_type": "threshold",
        "conditions": {
            "type": "temperature_thi",
            "thi_threshold": 28,
            "consecutive": 2,
        },
        "actions": {"notify": True, "auto_log": True},
        "cooldown_minutes": 120,
    },
    {
        "id": "payment_overdue",
        "name": "Payment Overdue",
        "trigger_type": "schedule",
        "conditions": {"type": "payment_overdue", "days_overdue": 1},
        "actions": {"notify": True, "email_client": True},
        "cooldown_minutes": 1440,
    },
    {
        "id": "outbreak_response",
        "name": "Outbreak Response",
        "trigger_type": "data_change",
        "conditions": {"type": "outbreak_active"},
        "actions": {"notify": True, "priority": "high", "email_team": True},
        "cooldown_minutes": 60,
    },
    {
        "id": "production_target",
        "name": "Production Below Target",
        "trigger_type": "threshold",
        "conditions": {"type": "below_target", "consecutive_days": 3},
        "actions": {"notify": True},
        "cooldown_minutes": 1440,
    },
]


# ── GET /workflows/presets ──
@router.get("/presets")
async def list_presets(
    user: User = Depends(require_feature("workflows")),
):
    return WORKFLOW_PRESETS


# ── GET /workflows/rules ──
@router.get("/rules", response_model=list[WorkflowRuleRead])
async def list_rules(
    farm_id: uuid.UUID = Query(...),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Lista reglas de workflow para una granja."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.list_rules(farm_id, page=page, size=size)


# ── POST /workflows/rules ──
@router.post(
    "/rules",
    response_model=WorkflowRuleRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule(
    data: WorkflowRuleCreate,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Crea una nueva regla de workflow."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.create_rule(data)


# ── GET /workflows/rules/{rule_id} ──
@router.get("/rules/{rule_id}", response_model=WorkflowRuleRead)
async def get_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene una regla de workflow por ID."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.get_rule(rule_id)


# ── PUT /workflows/rules/{rule_id} ──
@router.put("/rules/{rule_id}", response_model=WorkflowRuleRead)
async def update_rule(
    rule_id: uuid.UUID,
    data: WorkflowRuleUpdate,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza una regla de workflow existente."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.update_rule(rule_id, data)


# ── DELETE /workflows/rules/{rule_id} ──
@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Elimina una regla de workflow."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    await svc.delete_rule(rule_id)


# ── POST /workflows/rules/{rule_id}/toggle ──
@router.post("/rules/{rule_id}/toggle", response_model=WorkflowRuleRead)
async def toggle_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Alterna el estado activo/inactivo de una regla."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.toggle_rule(rule_id)


# ── POST /workflows/rules/{rule_id}/test ──
@router.post("/rules/{rule_id}/test")
async def test_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Ejecuta una regla en modo dry-run (prueba sin acciones reales)."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.test_rule(rule_id)


# ── POST /workflows/evaluate (bulk evaluate all active rules) ──
@router.post("/evaluate")
async def evaluate_all(
    farm_id: uuid.UUID = Query(...),
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Evalúa todas las reglas activas de una granja."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.evaluate_all(farm_id)


# ── GET /workflows/executions ──
@router.get("/executions", response_model=list[WorkflowExecutionRead])
async def list_executions(
    farm_id: uuid.UUID = Query(...),
    rule_id: uuid.UUID = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    """Lista ejecuciones de workflow para una granja."""
    svc = WorkflowsService(db, user.organization_id, user.id)
    return await svc.list_executions(farm_id, rule_id=rule_id, page=page, size=size)
