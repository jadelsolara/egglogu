"""Server-side workflow rule evaluator and action executor."""
import logging
from datetime import datetime, timedelta, timezone, date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.production import DailyProduction
from src.models.health import Outbreak
from src.models.feed import FeedPurchase, FeedConsumption
from src.models.finance import Receivable
from src.models.environment import EnvironmentReading
from src.models.workflow import WorkflowRule, WorkflowExecution

logger = logging.getLogger("egglogu.workflows")


async def _check_mortality_spike(db: AsyncSession, rule: WorkflowRule) -> dict:
    """Check if deaths exceed threshold in the period."""
    cond = rule.conditions
    threshold = cond.get("threshold", 5)
    hours = cond.get("period_hours", 24)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    stmt = select(func.sum(DailyProduction.deaths)).where(
        DailyProduction.organization_id == rule.organization_id,
        DailyProduction.farm_id == rule.farm_id,
        DailyProduction.created_at >= since,
    )
    total = (await db.execute(stmt)).scalar() or 0
    matched = total >= threshold
    return {"matched": matched, "value": total, "threshold": threshold}


async def _check_production_drop(db: AsyncSession, rule: WorkflowRule) -> dict:
    """Check if hen-day% dropped vs recent average."""
    cond = rule.conditions
    drop_pct = cond.get("drop_pct", 10)
    vs_days = cond.get("vs_period_days", 7)
    today = date.today()

    avg_stmt = select(func.avg(DailyProduction.hen_day_pct)).where(
        DailyProduction.organization_id == rule.organization_id,
        DailyProduction.farm_id == rule.farm_id,
        DailyProduction.date >= today - timedelta(days=vs_days),
        DailyProduction.date < today,
    )
    avg = (await db.execute(avg_stmt)).scalar()
    if not avg:
        return {"matched": False, "reason": "no data"}

    today_stmt = select(func.avg(DailyProduction.hen_day_pct)).where(
        DailyProduction.organization_id == rule.organization_id,
        DailyProduction.farm_id == rule.farm_id,
        DailyProduction.date == today,
    )
    current = (await db.execute(today_stmt)).scalar()
    if not current:
        return {"matched": False, "reason": "no today data"}

    actual_drop = ((float(avg) - float(current)) / float(avg)) * 100
    matched = actual_drop >= drop_pct
    return {"matched": matched, "drop_pct": round(actual_drop, 2), "threshold_pct": drop_pct}


async def _check_feed_stock(db: AsyncSession, rule: WorkflowRule) -> dict:
    """Check if feed stock is critically low."""
    cond = rule.conditions
    days_threshold = cond.get("days_remaining", 3)

    # Get total purchased vs consumed
    purchased = (await db.execute(
        select(func.sum(FeedPurchase.quantity_kg)).where(
            FeedPurchase.organization_id == rule.organization_id,
            FeedPurchase.farm_id == rule.farm_id,
        )
    )).scalar() or 0
    consumed = (await db.execute(
        select(func.sum(FeedConsumption.quantity_kg)).where(
            FeedConsumption.organization_id == rule.organization_id,
            FeedConsumption.farm_id == rule.farm_id,
        )
    )).scalar() or 0

    stock = float(purchased) - float(consumed)
    if stock <= 0:
        return {"matched": True, "stock_kg": 0, "days_remaining": 0}

    # Avg daily consumption last 30 days
    avg_daily = (await db.execute(
        select(func.avg(FeedConsumption.quantity_kg)).where(
            FeedConsumption.organization_id == rule.organization_id,
            FeedConsumption.farm_id == rule.farm_id,
            FeedConsumption.date >= date.today() - timedelta(days=30),
        )
    )).scalar() or 0

    if float(avg_daily) <= 0:
        return {"matched": False, "reason": "no consumption data"}

    days_left = stock / float(avg_daily)
    matched = days_left <= days_threshold
    return {"matched": matched, "days_remaining": round(days_left, 1), "threshold_days": days_threshold}


async def _check_outbreak(db: AsyncSession, rule: WorkflowRule) -> dict:
    """Check for active outbreaks."""
    stmt = select(func.count()).where(
        Outbreak.organization_id == rule.organization_id,
        Outbreak.farm_id == rule.farm_id,
        Outbreak.status == "active",
    )
    count = (await db.execute(stmt)).scalar() or 0
    return {"matched": count > 0, "active_outbreaks": count}


async def _check_payment_overdue(db: AsyncSession, rule: WorkflowRule) -> dict:
    """Check for overdue receivables."""
    cond = rule.conditions
    days = cond.get("days_overdue", 1)
    cutoff = date.today() - timedelta(days=days)

    stmt = select(func.count()).where(
        Receivable.organization_id == rule.organization_id,
        Receivable.farm_id == rule.farm_id,
        Receivable.due_date <= cutoff,
        Receivable.paid == False,  # noqa: E712
    )
    count = (await db.execute(stmt)).scalar() or 0
    return {"matched": count > 0, "overdue_count": count}


async def _check_below_target(db: AsyncSession, rule: WorkflowRule) -> dict:
    """Check if production has been below target for consecutive days."""
    cond = rule.conditions
    consec = cond.get("consecutive_days", 3)
    today = date.today()

    # Check last N days — simplified: look at hen_day_pct vs 80% default target
    stmt = (
        select(DailyProduction.hen_day_pct)
        .where(
            DailyProduction.organization_id == rule.organization_id,
            DailyProduction.farm_id == rule.farm_id,
            DailyProduction.date >= today - timedelta(days=consec),
        )
        .order_by(DailyProduction.date.desc())
        .limit(consec)
    )
    rows = (await db.execute(stmt)).scalars().all()
    if len(rows) < consec:
        return {"matched": False, "reason": "insufficient data"}

    target = cond.get("target_pct", 80)
    all_below = all(float(r) < target for r in rows)
    return {"matched": all_below, "days_checked": consec, "target_pct": target}


# Map condition types to evaluator functions
CONDITION_EVALUATORS = {
    "mortality_spike": _check_mortality_spike,
    "production_drop": _check_production_drop,
    "feed_stock_low": _check_feed_stock,
    "outbreak_active": _check_outbreak,
    "payment_overdue": _check_payment_overdue,
    "below_target": _check_below_target,
    # vaccine_due and temperature_thi are primarily client-side evaluated
}


async def evaluate_rule(
    db: AsyncSession, rule: WorkflowRule, dry_run: bool = False
) -> dict:
    """Evaluate a single workflow rule against current data.

    Args:
        db: Database session
        rule: The workflow rule to evaluate
        dry_run: If True, don't execute actions or log execution

    Returns:
        dict with matched status and details
    """
    cond_type = rule.conditions.get("type")
    evaluator = CONDITION_EVALUATORS.get(cond_type)

    if not evaluator:
        return {"matched": False, "error": f"Unknown condition type: {cond_type}"}

    # Check cooldown
    if not dry_run and rule.last_triggered_at:
        cooldown_until = rule.last_triggered_at + timedelta(minutes=rule.cooldown_minutes)
        if datetime.now(timezone.utc) < cooldown_until:
            return {"matched": False, "reason": "cooldown", "cooldown_until": cooldown_until.isoformat()}

    result = await evaluator(db, rule)

    if result["matched"] and not dry_run:
        await _execute_actions(db, rule, result)

    return result


async def _execute_actions(
    db: AsyncSession, rule: WorkflowRule, eval_result: dict
) -> None:
    """Execute the actions defined in a workflow rule."""
    actions = rule.actions
    actions_executed = {}

    # Notify action (logged for client-side pickup)
    if actions.get("notify"):
        actions_executed["notify"] = True

    # Email actions
    if actions.get("email") or actions.get("email_vet") or actions.get("email_team") or actions.get("email_client"):
        actions_executed["email_queued"] = True
        # Actual email sending would go through src.core.email
        # For now we log it — the client-side handles immediate notifications

    # Auto-log action
    if actions.get("auto_log"):
        actions_executed["auto_log"] = True

    # Auto-task action
    if actions.get("auto_task"):
        actions_executed["auto_task"] = True

    # Update rule metadata
    rule.last_triggered_at = datetime.now(timezone.utc)
    rule.execution_count = (rule.execution_count or 0) + 1

    # Log execution
    execution = WorkflowExecution(
        organization_id=rule.organization_id,
        rule_id=rule.id,
        farm_id=rule.farm_id,
        triggered_by="system",
        conditions_matched=eval_result,
        actions_executed=actions_executed,
        status="completed",
    )
    db.add(execution)
    await db.flush()

    logger.info("Workflow triggered: %s (rule=%s)", rule.name, str(rule.id)[:8])
