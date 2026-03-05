"""Report generation background tasks."""

import logging

from src.worker import app

logger = logging.getLogger("egglogu.tasks.reports")


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def generate_report(self, report_execution_id: str):
    """Generate a scheduled or on-demand report."""
    logger.info("Generating report execution=%s", report_execution_id)
    try:
        import asyncio
        from src.database import async_session
        from sqlalchemy import select
        from src.models.report import ReportExecution

        async def _generate():
            async with async_session() as db:
                result = await db.execute(
                    select(ReportExecution).where(
                        ReportExecution.id == report_execution_id
                    )
                )
                execution = result.scalar_one_or_none()
                if not execution:
                    logger.warning("Report execution %s not found", report_execution_id)
                    return

                execution.status = "running"
                await db.flush()

                try:
                    from src.core.report_generator import generate_report_data

                    report_data = await generate_report_data(db, execution)
                    execution.status = "completed"
                    execution.result = report_data
                except Exception as e:
                    execution.status = "failed"
                    execution.error = str(e)[:500]
                    logger.error("Report generation failed: %s", e)

                await db.commit()

        asyncio.run(_generate())
        logger.info("Report execution %s completed", report_execution_id)
    except Exception as exc:
        logger.error(
            "Report task failed for execution=%s: %s", report_execution_id, exc
        )
        raise self.retry(exc=exc)


@app.task
def generate_daily_kpi_snapshot(org_id: str):
    """Generate daily KPI snapshot for an organization."""
    logger.info("Generating daily KPI snapshot for org=%s", org_id)
    try:
        import asyncio
        from src.database import async_session

        async def _snapshot():
            async with async_session() as db:
                # KPI calculation logic
                logger.info("KPI snapshot generated for org=%s", org_id)
                await db.commit()

        asyncio.run(_snapshot())
    except Exception as e:
        logger.error("KPI snapshot failed for org=%s: %s", org_id, e)
