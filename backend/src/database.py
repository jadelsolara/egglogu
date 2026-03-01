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
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
