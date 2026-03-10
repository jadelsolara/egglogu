import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

from src.config import settings
from src.database import Base
from src.models import *  # noqa: F401, F403 — ensure all models are loaded

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ── Prevent model-defined enums from auto-creating during migrations ──
# All migrations handle enum creation explicitly via:
#   DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$
# Without this patch, asyncpg + SQLAlchemy's _on_table_create fires a raw
# CREATE TYPE (bypassing checkfirst) causing DuplicateObjectError.
# The generic sa.Enum delegates to PG ENUM's _on_table_create which is what
# actually emits CREATE TYPE DDL. Making it a no-op is safe because every
# migration already creates its enums explicitly with idempotent PL/pgSQL.
_original_on_table_create = PG_ENUM._on_table_create
PG_ENUM._on_table_create = lambda self, target, bind, **kw: None


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = create_async_engine(settings.DATABASE_URL)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
