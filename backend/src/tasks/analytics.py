"""Analytics background tasks — materialized view refresh + KPI generation."""

import logging
import time

from src.worker import app

logger = logging.getLogger("egglogu.tasks.analytics")

# Materialized views to refresh (order matters for dependencies)
MATERIALIZED_VIEWS = [
    "mv_daily_production_summary",
    "mv_weekly_kpi",
    "mv_monthly_costs",
    "mv_org_production_trends",
    "mv_flock_fcr",
]


@app.task(bind=True, max_retries=2, default_retry_delay=30)
def refresh_materialized_views(self):
    """Refresh all analytics materialized views concurrently.

    Runs every 15 min via Celery Beat.  Uses CONCURRENTLY to avoid locking
    reads during refresh (requires unique index on each view).
    """
    logger.info(
        "Starting materialized view refresh (%d views)", len(MATERIALIZED_VIEWS)
    )
    start = time.perf_counter()

    try:
        import asyncio
        from sqlalchemy import text
        from src.database import engine

        async def _refresh():
            async with engine.begin() as conn:
                for view_name in MATERIALIZED_VIEWS:
                    t0 = time.perf_counter()
                    try:
                        await conn.execute(
                            text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name}")
                        )
                        elapsed = round((time.perf_counter() - t0) * 1000)
                        logger.info("Refreshed %s (%dms)", view_name, elapsed)
                    except Exception as e:
                        logger.warning("Failed to refresh %s: %s", view_name, e)
                        # Try non-concurrent refresh as fallback
                        try:
                            await conn.execute(
                                text(f"REFRESH MATERIALIZED VIEW {view_name}")
                            )
                            logger.info(
                                "Refreshed %s (non-concurrent fallback)", view_name
                            )
                        except Exception as e2:
                            logger.error(
                                "Failed to refresh %s (fallback): %s", view_name, e2
                            )

        asyncio.run(_refresh())

        total_ms = round((time.perf_counter() - start) * 1000)
        logger.info("Materialized view refresh complete (%dms total)", total_ms)

    except Exception as exc:
        logger.error("Materialized view refresh failed: %s", exc)
        raise self.retry(exc=exc)


@app.task
def refresh_single_view(view_name: str):
    """Refresh a single materialized view on demand."""
    if view_name not in MATERIALIZED_VIEWS:
        logger.warning("Unknown materialized view: %s", view_name)
        return {"error": f"Unknown view: {view_name}"}

    try:
        import asyncio
        from sqlalchemy import text
        from src.database import engine

        async def _refresh():
            async with engine.begin() as conn:
                await conn.execute(
                    text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name}")
                )

        start = time.perf_counter()
        asyncio.run(_refresh())
        elapsed = round((time.perf_counter() - start) * 1000)
        logger.info("Refreshed %s on demand (%dms)", view_name, elapsed)
        return {"view": view_name, "elapsed_ms": elapsed}

    except Exception as e:
        logger.error("On-demand refresh failed for %s: %s", view_name, e)
        return {"error": str(e)[:500]}
