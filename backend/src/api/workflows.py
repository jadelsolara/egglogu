import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_feature
from src.core.exceptions import NotFoundError, ForbiddenError
from src.core.plans import get_plan_limits
from src.database import get_db
from src.models.auth import User
from src.models.workflow import WorkflowRule, WorkflowExecution
from src.schemas.workflow import (
    WorkflowRuleCreate,
    WorkflowRuleRead,
    WorkflowRuleUpdate,
    WorkflowExecutionRead,
)

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
        "conditions": {"type": "temperature_thi", "thi_threshold": 28, "consecutive": 2},
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


async def _check_rule_limit(user: User, current_count: int, db) -> None:
    """Validate plan-level workflow rule limit."""
    from src.api.deps import get_subscription, _resolve_plan

    sub = await get_subscription(user.organization_id, db)
    plan = await _resolve_plan(sub, db)
    limits = get_plan_limits(plan)
    wf_cfg = limits.get("workflows", {})
    max_rules = wf_cfg.get("max_rules")
    if max_rules is not None and current_count >= max_rules:
        raise ForbiddenError(
            f"Limit reached: max {max_rules} workflow rules. Upgrade your plan."
        )


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
    stmt = (
        select(WorkflowRule)
        .where(
            WorkflowRule.organization_id == user.organization_id,
            WorkflowRule.farm_id == farm_id,
        )
        .order_by(WorkflowRule.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


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
    # Check limit
    count_stmt = select(func.count()).where(
        WorkflowRule.organization_id == user.organization_id,
        WorkflowRule.farm_id == data.farm_id,
    )
    count = (await db.execute(count_stmt)).scalar() or 0
    await _check_rule_limit(user, count, db)

    obj = WorkflowRule(
        **data.model_dump(),
        organization_id=user.organization_id,
        created_by=user.id,
    )
    db.add(obj)
    await db.flush()
    return obj


# ── GET /workflows/rules/{rule_id} ──
@router.get("/rules/{rule_id}", response_model=WorkflowRuleRead)
async def get_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowRule).where(
        WorkflowRule.id == rule_id,
        WorkflowRule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Workflow rule not found")
    return obj


# ── PUT /workflows/rules/{rule_id} ──
@router.put("/rules/{rule_id}", response_model=WorkflowRuleRead)
async def update_rule(
    rule_id: uuid.UUID,
    data: WorkflowRuleUpdate,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowRule).where(
        WorkflowRule.id == rule_id,
        WorkflowRule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Workflow rule not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    await db.flush()
    return obj


# ── DELETE /workflows/rules/{rule_id} ──
@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowRule).where(
        WorkflowRule.id == rule_id,
        WorkflowRule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Workflow rule not found")
    await db.delete(obj)
    await db.flush()


# ── POST /workflows/rules/{rule_id}/toggle ──
@router.post("/rules/{rule_id}/toggle", response_model=WorkflowRuleRead)
async def toggle_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowRule).where(
        WorkflowRule.id == rule_id,
        WorkflowRule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Workflow rule not found")
    obj.is_active = not obj.is_active
    await db.flush()
    return obj


# ── POST /workflows/rules/{rule_id}/test ──
@router.post("/rules/{rule_id}/test")
async def test_rule(
    rule_id: uuid.UUID,
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowRule).where(
        WorkflowRule.id == rule_id,
        WorkflowRule.organization_id == user.organization_id,
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if not obj:
        raise NotFoundError("Workflow rule not found")

    from src.core.workflow_evaluator import evaluate_rule

    test_result = await evaluate_rule(db, obj, dry_run=True)
    return {"rule_id": str(rule_id), "would_trigger": test_result["matched"], "details": test_result}


# ── POST /workflows/evaluate (bulk evaluate all active rules) ──
@router.post("/evaluate")
async def evaluate_all(
    farm_id: uuid.UUID = Query(...),
    user: User = Depends(require_feature("workflows")),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(WorkflowRule).where(
        WorkflowRule.organization_id == user.organization_id,
        WorkflowRule.farm_id == farm_id,
        WorkflowRule.is_active == True,  # noqa: E712
    )
    result = await db.execute(stmt)
    rules = result.scalars().all()

    from src.core.workflow_evaluator import evaluate_rule

    results = []
    for rule in rules:
        eval_result = await evaluate_rule(db, rule, dry_run=False)
        results.append({
            "rule_id": str(rule.id),
            "name": rule.name,
            "triggered": eval_result["matched"],
        })
    return {"evaluated": len(results), "results": results}


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
    stmt = (
        select(WorkflowExecution)
        .where(
            WorkflowExecution.organization_id == user.organization_id,
            WorkflowExecution.farm_id == farm_id,
        )
        .order_by(WorkflowExecution.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    if rule_id:
        stmt = stmt.where(WorkflowExecution.rule_id == rule_id)
    result = await db.execute(stmt)
    return result.scalars().all()
