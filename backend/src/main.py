from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.database import engine
from src.api import auth, farms, flocks, production, health, feed, clients, finance, environment, operations, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="EGGlogU API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.get("/health")
async def health_check():
    return {"status": "ok"}
