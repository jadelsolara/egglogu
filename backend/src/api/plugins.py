"""Plugin management API — install, uninstall, configure, marketplace."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_current_user, require_role
from src.core.plugins import VALID_HOOKS
from src.models.plugin import Plugin, PluginInstall

router = APIRouter(prefix="/plugins", tags=["plugins"])


# ─── Schemas ─────────────────────────────────────────────────────────

class PluginResponse(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    version: str
    description: str | None
    author: str | None
    hooks: list[str]
    permissions: list[str]
    config_schema: dict | None
    is_public: bool
    created_at: datetime


class PluginInstallResponse(BaseModel):
    id: uuid.UUID
    plugin_id: uuid.UUID
    plugin_slug: str
    plugin_name: str
    is_active: bool
    config: dict | None
    installed_by: uuid.UUID | None
    last_executed_at: datetime | None
    execution_count: int
    last_error: str | None
    created_at: datetime


class PluginInstallCreate(BaseModel):
    plugin_id: uuid.UUID
    config: dict | None = None


class PluginInstallUpdate(BaseModel):
    is_active: bool | None = None
    config: dict | None = None


class PluginCreate(BaseModel):
    """Admin-only: register a new plugin in the marketplace."""
    slug: str
    name: str
    version: str
    description: str | None = None
    author: str | None = None
    hooks: list[str] = []
    permissions: list[str] = []
    config_schema: dict | None = None
    is_public: bool = False


# ─── Marketplace (public plugins) ───────────────────────────────────

@router.get("/marketplace")
async def list_marketplace(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = None,
):
    """List all public plugins available for installation."""
    query = select(Plugin).where(Plugin.is_public == True)
    if search:
        query = query.where(
            Plugin.name.ilike(f"%{search}%") | Plugin.description.ilike(f"%{search}%")
        )
    query = query.order_by(Plugin.name).offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    plugins = result.scalars().all()

    count_q = select(func.count(Plugin.id)).where(Plugin.is_public == True)
    if search:
        count_q = count_q.where(
            Plugin.name.ilike(f"%{search}%") | Plugin.description.ilike(f"%{search}%")
        )
    total = (await db.execute(count_q)).scalar()

    return {
        "items": [_plugin_to_response(p) for p in plugins],
        "total": total,
        "page": page,
        "size": size,
    }


# ─── Installed Plugins (org-scoped) ─────────────────────────────────

@router.get("")
async def list_installed(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """List all plugins installed for the organization."""
    offset = (page - 1) * size
    result = await db.execute(
        select(PluginInstall, Plugin)
        .join(Plugin, PluginInstall.plugin_id == Plugin.id)
        .where(PluginInstall.organization_id == user.organization_id)
        .order_by(PluginInstall.created_at.desc())
        .offset(offset)
        .limit(size)
    )
    rows = result.all()

    count_result = await db.execute(
        select(func.count(PluginInstall.id))
        .where(PluginInstall.organization_id == user.organization_id)
    )
    total = count_result.scalar()

    return {
        "items": [_install_to_response(install, plugin) for install, plugin in rows],
        "total": total,
        "page": page,
        "size": size,
    }


@router.post("", status_code=201)
async def install_plugin(
    body: PluginInstallCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin", "owner")),
):
    """Install a plugin for the organization."""
    # Verify plugin exists
    plugin = await _get_plugin_or_404(db, body.plugin_id)

    # Check not already installed
    existing = await db.execute(
        select(PluginInstall).where(
            PluginInstall.plugin_id == body.plugin_id,
            PluginInstall.organization_id == user.organization_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Plugin already installed")

    install = PluginInstall(
        plugin_id=body.plugin_id,
        organization_id=user.organization_id,
        installed_by=user.id,
        config=body.config,
        is_active=True,
    )
    db.add(install)
    await db.commit()
    await db.refresh(install)

    return _install_to_response(install, plugin)


@router.get("/{install_id}")
async def get_install(
    install_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get details of an installed plugin."""
    install, plugin = await _get_install_or_404(db, install_id, user.organization_id)
    return _install_to_response(install, plugin)


@router.put("/{install_id}")
async def update_install(
    install_id: uuid.UUID,
    body: PluginInstallUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin", "owner")),
):
    """Update plugin config or toggle active/inactive."""
    install, plugin = await _get_install_or_404(db, install_id, user.organization_id)

    if body.is_active is not None:
        install.is_active = body.is_active
    if body.config is not None:
        install.config = body.config

    await db.commit()
    await db.refresh(install)
    return _install_to_response(install, plugin)


@router.delete("/{install_id}", status_code=204)
async def uninstall_plugin(
    install_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin", "owner")),
):
    """Uninstall a plugin from the organization."""
    install, _ = await _get_install_or_404(db, install_id, user.organization_id)
    await db.delete(install)
    await db.commit()


# ─── Admin: Plugin Registry ─────────────────────────────────────────

@router.post("/registry", status_code=201)
async def register_plugin(
    body: PluginCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("superadmin")),
):
    """Superadmin: register a new plugin in the system."""
    # Validate hooks
    invalid = set(body.hooks) - VALID_HOOKS
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid hooks: {', '.join(invalid)}. Valid: {', '.join(sorted(VALID_HOOKS))}",
        )

    # Check slug uniqueness
    existing = await db.execute(select(Plugin).where(Plugin.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Plugin slug '{body.slug}' already exists")

    plugin = Plugin(
        slug=body.slug,
        name=body.name,
        version=body.version,
        description=body.description,
        author=body.author,
        hooks=body.hooks,
        permissions=body.permissions,
        config_schema=body.config_schema,
        is_public=body.is_public,
    )
    db.add(plugin)
    await db.commit()
    await db.refresh(plugin)
    return _plugin_to_response(plugin)


@router.get("/registry/hooks")
async def list_valid_hooks(user=Depends(get_current_user)):
    """List all valid hook points for plugin development."""
    return {"hooks": sorted(VALID_HOOKS)}


# ─── Helpers ─────────────────────────────────────────────────────────

async def _get_plugin_or_404(db: AsyncSession, plugin_id: uuid.UUID) -> Plugin:
    result = await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    plugin = result.scalar_one_or_none()
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return plugin


async def _get_install_or_404(
    db: AsyncSession, install_id: uuid.UUID, org_id
) -> tuple[PluginInstall, Plugin]:
    result = await db.execute(
        select(PluginInstall, Plugin)
        .join(Plugin, PluginInstall.plugin_id == Plugin.id)
        .where(
            PluginInstall.id == install_id,
            PluginInstall.organization_id == org_id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Plugin install not found")
    return row[0], row[1]


def _plugin_to_response(p: Plugin) -> dict:
    return PluginResponse(
        id=p.id,
        slug=p.slug,
        name=p.name,
        version=p.version,
        description=p.description,
        author=p.author,
        hooks=p.hooks or [],
        permissions=p.permissions or [],
        config_schema=p.config_schema,
        is_public=p.is_public,
        created_at=p.created_at,
    ).model_dump()


def _install_to_response(install: PluginInstall, plugin: Plugin) -> dict:
    return PluginInstallResponse(
        id=install.id,
        plugin_id=install.plugin_id,
        plugin_slug=plugin.slug,
        plugin_name=plugin.name,
        is_active=install.is_active,
        config=install.config,
        installed_by=install.installed_by,
        last_executed_at=install.last_executed_at,
        execution_count=install.execution_count,
        last_error=install.last_error,
        created_at=install.created_at,
    ).model_dump()
