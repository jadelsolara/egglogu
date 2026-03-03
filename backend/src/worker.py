"""Celery worker configuration for EGGlogU background jobs.

Usage:
    celery -A src.worker worker --loglevel=info
    celery -A src.worker beat --loglevel=info
"""

from celery import Celery
from celery.schedules import crontab

from src.config import settings

app = Celery(
    "egglogu",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,

    # Retry
    task_default_retry_delay=60,
    task_max_retries=3,

    # Results
    result_expires=3600,  # 1 hour

    # Task routing
    task_routes={
        "src.tasks.email.*": {"queue": "email"},
        "src.tasks.reports.*": {"queue": "reports"},
        "src.tasks.webhooks.*": {"queue": "webhooks"},
        "src.tasks.sync.*": {"queue": "default"},
        "src.tasks.billing.*": {"queue": "default"},
        "src.tasks.analytics.*": {"queue": "analytics"},
    },

    # Beat schedule (periodic tasks)
    beat_schedule={
        "refresh-kpi-snapshots": {
            "task": "src.tasks.analytics.refresh_materialized_views",
            "schedule": crontab(minute="*/15"),  # Every 15 minutes
        },
        "refresh-weather-cache": {
            "task": "src.tasks.sync.refresh_weather_cache",
            "schedule": crontab(minute="0", hour="*/6"),  # Every 6 hours
        },
        "cleanup-expired-sessions": {
            "task": "src.tasks.sync.cleanup_expired_sessions",
            "schedule": crontab(minute="0", hour="3"),  # Daily at 3 AM
        },
    },
)

# Auto-discover tasks in src.tasks package
app.autodiscover_tasks(["src.tasks"])
