"""Server-side report generation and email delivery."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.auth import User
from src.models.production import DailyProduction
from src.models.finance import Income, Expense
from src.models.health import Vaccine, Medication, Outbreak
from src.models.feed import FeedPurchase, FeedConsumption
from src.models.report import ReportSchedule, ReportExecution
from src.schemas.report import ReportGenerateRequest

logger = logging.getLogger("egglogu.reports")


async def _aggregate_production(db: AsyncSession, farm_id, org_id) -> dict:
    """Aggregate production metrics for the last 30 days."""
    from datetime import timedelta, date

    end = date.today()
    start = end - timedelta(days=30)
    stmt = select(
        func.sum(DailyProduction.total_eggs),
        func.avg(DailyProduction.hen_day_pct),
        func.sum(DailyProduction.deaths),
        func.count(),
    ).where(
        DailyProduction.organization_id == org_id,
        DailyProduction.farm_id == farm_id,
        DailyProduction.date >= start,
        DailyProduction.date <= end,
    )
    row = (await db.execute(stmt)).one_or_none()
    return {
        "total_eggs": row[0] or 0,
        "avg_hen_day_pct": round(float(row[1] or 0), 2),
        "total_deaths": row[2] or 0,
        "records": row[3] or 0,
        "period": f"{start.isoformat()} to {end.isoformat()}",
    }


async def _aggregate_financial(db: AsyncSession, farm_id, org_id) -> dict:
    """Aggregate financial data for the last 30 days."""
    from datetime import timedelta, date

    end = date.today()
    start = end - timedelta(days=30)

    income_stmt = select(func.sum(Income.amount)).where(
        Income.organization_id == org_id,
        Income.farm_id == farm_id,
        Income.date >= start,
        Income.date <= end,
    )
    expense_stmt = select(func.sum(Expense.amount)).where(
        Expense.organization_id == org_id,
        Expense.farm_id == farm_id,
        Expense.date >= start,
        Expense.date <= end,
    )
    total_income = (await db.execute(income_stmt)).scalar() or 0
    total_expense = (await db.execute(expense_stmt)).scalar() or 0
    return {
        "total_income": float(total_income),
        "total_expenses": float(total_expense),
        "net": float(total_income - total_expense),
        "period": f"{start.isoformat()} to {end.isoformat()}",
    }


async def _aggregate_health(db: AsyncSession, farm_id, org_id) -> dict:
    """Count health events in last 30 days."""
    from datetime import timedelta, date

    end = date.today()
    start = end - timedelta(days=30)

    vax = (await db.execute(
        select(func.count()).where(
            Vaccine.organization_id == org_id,
            Vaccine.farm_id == farm_id,
            Vaccine.date >= start,
        )
    )).scalar() or 0
    meds = (await db.execute(
        select(func.count()).where(
            Medication.organization_id == org_id,
            Medication.farm_id == farm_id,
            Medication.start_date >= start,
        )
    )).scalar() or 0
    outbreaks = (await db.execute(
        select(func.count()).where(
            Outbreak.organization_id == org_id,
            Outbreak.farm_id == farm_id,
            Outbreak.start_date >= start,
        )
    )).scalar() or 0
    return {"vaccines": vax, "medications": meds, "outbreaks": outbreaks}


async def _aggregate_feed(db: AsyncSession, farm_id, org_id) -> dict:
    """Feed stats for last 30 days."""
    from datetime import timedelta, date

    end = date.today()
    start = end - timedelta(days=30)

    purchased = (await db.execute(
        select(func.sum(FeedPurchase.quantity_kg)).where(
            FeedPurchase.organization_id == org_id,
            FeedPurchase.farm_id == farm_id,
            FeedPurchase.date >= start,
        )
    )).scalar() or 0
    consumed = (await db.execute(
        select(func.sum(FeedConsumption.quantity_kg)).where(
            FeedConsumption.organization_id == org_id,
            FeedConsumption.farm_id == farm_id,
            FeedConsumption.date >= start,
        )
    )).scalar() or 0
    cost = (await db.execute(
        select(func.sum(FeedPurchase.total_cost)).where(
            FeedPurchase.organization_id == org_id,
            FeedPurchase.farm_id == farm_id,
            FeedPurchase.date >= start,
        )
    )).scalar() or 0
    return {
        "purchased_kg": float(purchased),
        "consumed_kg": float(consumed),
        "total_cost": float(cost),
    }


AGGREGATORS = {
    "production": _aggregate_production,
    "financial": _aggregate_financial,
    "health": _aggregate_health,
    "feed": _aggregate_feed,
    "kpi": _aggregate_production,  # KPI reuses production as base
}


def _build_email_html(template: str, summary: dict) -> str:
    """Build a simple HTML email body from report summary."""
    rows = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #eee'><strong>{k}</strong></td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #eee'>{v}</td></tr>"
        for k, v in summary.items()
    )
    return f"""
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#2563eb">EGGlogU Report: {template.title()}</h2>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">{rows}</table>
      <p style="color:#999;font-size:11px">Generated automatically by EGGlogU</p>
    </div>
    """


async def execute_report(
    db: AsyncSession, schedule: ReportSchedule, user: User
) -> ReportExecution:
    """Execute a scheduled report: aggregate data, optionally email, log execution."""
    aggregator = AGGREGATORS.get(schedule.template.value, _aggregate_production)
    summary = await aggregator(db, schedule.farm_id, schedule.organization_id)

    # Send email if recipients configured
    recipients_sent = None
    if schedule.recipients:
        from src.core.email import _send_email

        html = _build_email_html(schedule.template.value, summary)
        for email in schedule.recipients.split(","):
            email = email.strip()
            if email:
                await _send_email(email, f"EGGlogU Report: {schedule.name}", html, tipo="reporte")
        recipients_sent = schedule.recipients

    # Update schedule
    schedule.last_sent_at = datetime.now(timezone.utc)

    # Log execution
    execution = ReportExecution(
        organization_id=schedule.organization_id,
        schedule_id=schedule.id,
        farm_id=schedule.farm_id,
        template=schedule.template,
        triggered_by=user.id,
        status="completed",
        recipients_sent=recipients_sent,
        result_summary=summary,
    )
    db.add(execution)
    await db.flush()

    logger.info("Report executed: %s (template=%s)", schedule.name, schedule.template.value)
    return execution


async def generate_adhoc_report(
    db: AsyncSession, data: ReportGenerateRequest, user: User
) -> ReportExecution:
    """Generate a one-off report without a schedule."""
    aggregator = AGGREGATORS.get(data.template, _aggregate_production)
    summary = await aggregator(db, data.farm_id, user.organization_id)

    recipients_sent = None
    if data.send_email and data.recipients:
        from src.core.email import _send_email

        html = _build_email_html(data.template, summary)
        for email in data.recipients.split(","):
            email = email.strip()
            if email:
                await _send_email(email, f"EGGlogU Report: {data.template.title()}", html, tipo="reporte")
        recipients_sent = data.recipients

    execution = ReportExecution(
        organization_id=user.organization_id,
        farm_id=data.farm_id,
        template=data.template,
        triggered_by=user.id,
        status="completed",
        recipients_sent=recipients_sent,
        result_summary=summary,
    )
    db.add(execution)
    await db.flush()

    logger.info("Ad-hoc report generated: template=%s", data.template)
    return execution
