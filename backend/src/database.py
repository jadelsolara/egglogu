from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.config import settings

_engine_kwargs: dict = {"echo": False}

if "sqlite" not in settings.DATABASE_URL:
    _engine_kwargs.update(
        pool_size=20,
        max_overflow=30,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_timeout=30,
    )

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

# Read replica engine (falls back to primary if not configured)
_read_url = getattr(settings, "DATABASE_READ_URL", None) or settings.DATABASE_URL
read_engine = create_async_engine(_read_url, **_engine_kwargs)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
async_read_session = async_sessionmaker(
    read_engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def set_tenant_context(session: AsyncSession, org_id: str) -> None:
    """Set the PostgreSQL session variable for RLS tenant isolation.

    Must be called at the start of each request, BEFORE any queries.
    Uses SET LOCAL so the setting is scoped to the current transaction.
    """
    if "sqlite" in settings.DATABASE_URL:
        return  # SQLite doesn't support SET LOCAL (tests)
    await session.execute(text(f"SET LOCAL app.current_org = '{org_id}'"))


async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_read_db():
    """Read-only session for analytics/reporting (uses read replica if configured)."""
    async with async_read_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
