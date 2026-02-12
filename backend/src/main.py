from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.database import engine
from src.api import (
    auth, farms, flocks, production, health, feed, clients,
    finance, environment, operations, sync,
    biosecurity, traceability, planning, billing, trace_public,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="EGGlogU API", version="3.0.0", lifespan=lifespan)

allowed_origins = [settings.FRONTEND_URL]
if settings.FRONTEND_URL != "https://egglogu.com":
    allowed_origins.append("http://localhost:3000")
    allowed_origins.append("http://localhost:8080")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

prefix = "/api/v1"
app.include_router(auth.router, prefix=prefix)
app.include_router(farms.router, prefix=prefix)
app.include_router(flocks.router, prefix=prefix)
app.include_router(production.router, prefix=prefix)
app.include_router(health.router, prefix=prefix)
app.include_router(feed.router, prefix=prefix)
app.include_router(clients.router, prefix=prefix)
app.include_router(finance.router, prefix=prefix)
app.include_router(environment.router, prefix=prefix)
app.include_router(operations.router, prefix=prefix)
app.include_router(sync.router, prefix=prefix)
app.include_router(biosecurity.router, prefix=prefix)
app.include_router(traceability.router, prefix=prefix)
app.include_router(planning.router, prefix=prefix)
app.include_router(billing.router, prefix=prefix)

# Public routes (no /api/v1 prefix — cleaner QR URLs)
app.include_router(trace_public.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
