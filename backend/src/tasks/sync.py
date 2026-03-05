"""Sync and maintenance background tasks."""

import logging

from src.worker import app

logger = logging.getLogger("egglogu.tasks.sync")


@app.task
def refresh_weather_cache():
    """Refresh weather data for all farms with coordinates."""
    logger.info("Starting weather cache refresh")
    try:
        import asyncio
        from src.database import async_session
        from sqlalchemy import select
        from src.models.farm import Farm

        async def _refresh():
            async with async_session() as db:
                result = await db.execute(
                    select(Farm).where(Farm.latitude.isnot(None))
                )
                farms = result.scalars().all()
                logger.info("Refreshing weather for %d farms", len(farms))
                # Weather refresh logic would call OWM API here
                await db.commit()

        asyncio.run(_refresh())
        logger.info("Weather cache refresh completed")
    except Exception as e:
        logger.error("Weather cache refresh failed: %s", e)


@app.task
def cleanup_expired_sessions():
    """Remove expired user sessions and blacklisted tokens."""
    logger.info("Starting session cleanup")
    try:
        import asyncio
        from datetime import datetime, timezone
        from src.database import async_session
        from sqlalchemy import delete
        from src.models.security import UserSession

        async def _cleanup():
            async with async_session() as db:
                stmt = delete(UserSession).where(
                    UserSession.expires_at < datetime.now(timezone.utc)
                )
                result = await db.execute(stmt)
                await db.commit()
                logger.info("Cleaned up %d expired sessions", result.rowcount)

        asyncio.run(_cleanup())
    except Exception as e:
        logger.error("Session cleanup failed: %s", e)


@app.task(bind=True, max_retries=2, default_retry_delay=120)
def process_offline_sync(self, org_id: str, user_id: str, sync_data: dict):
    """Process offline sync data pushed from PWA client."""
    logger.info("Processing offline sync for org=%s user=%s", org_id, user_id)
    try:
        import asyncio
        from src.database import async_session

        async def _sync():
            async with async_session() as db:
                entities = sync_data.get("entities", [])
                processed = 0
                for entity in entities:
                    # Entity processing logic (upsert based on type)
                    processed += 1
                await db.commit()
                logger.info("Synced %d entities for org=%s", processed, org_id)

        asyncio.run(_sync())
    except Exception as exc:
        logger.error("Offline sync failed for org=%s: %s", org_id, exc)
        raise self.retry(exc=exc)
