"""Dev-only: create all tables in SQLite and start uvicorn."""
import asyncio
import sys
import os

# Ensure we're in the backend directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))


async def create_tables():
    # Patch JSONB -> JSON for SQLite compatibility
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy import JSON, event
    from sqlalchemy.engine import Engine

    @event.listens_for(Engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    from src.database import engine, Base
    import src.models  # noqa: F401 — registers all models

    # Replace JSONB columns with JSON for SQLite
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print(f"Tables created in {engine.url}")


if __name__ == "__main__":
    asyncio.run(create_tables())
    print("Starting uvicorn...")
    os.execvp(
        sys.executable,
        [sys.executable, "-m", "uvicorn", "src.main:app",
         "--host", "0.0.0.0", "--port", "8000", "--reload"],
    )
