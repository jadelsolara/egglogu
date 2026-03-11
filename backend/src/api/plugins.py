"""Plugin management API — install, uninstall, configure, marketplace."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_db, get_current_user, require_role
from src.core.plugins import VALID_HOOKS
from src.models.plugin import Plugin, PluginInstall
from src.services.plugins_service import PluginsService

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
    """Admin-only: registrar un nuevo plugin en el marketplace."""

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
    """Lista plugins públicos disponibles para instalación."""
    svc = PluginsService(db, user.organization_id, user.id)
    result = await svc.list_marketplace(page=page, size=size, search=search)
    return {
        "items": [_plugin_to_response(p) for p in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "size": result["size"],
    }


# ─── Installed Plugins (org-scoped) ─────────────────────────────────


@router.get("")
async def list_installed(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """Lista plugins instalados para la organización."""
    svc = PluginsService(db, user.organization_id, user.id)
    result = await svc.list_installed(page=page, size=size)
    return {
        "items": [
            _install_to_response(install, plugin)
            for install, plugin in result["rows"]
        ],
        "total": result["total"],
        "page": result["page"],
        "size": result["size"],
    }


@router.post("", status_code=201)
async def install_plugin(
    body: PluginInstallCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin", "owner")),
):
    """Instala un plugin para la organización."""
    svc = PluginsService(db, user.organization_id, user.id)
    install, plugin = await svc.install_plugin(body.plugin_id, body.config)
    return _install_to_response(install, plugin)


@router.get("/{install_id}")
async def get_install(
    install_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Obtiene detalle de un plugin instalado."""
    svc = PluginsService(db, user.organization_id, user.id)
    install, plugin = await svc.get_install(install_id)
    return _install_to_response(install, plugin)


@router.put("/{install_id}")
async def update_install(
    install_id: uuid.UUID,
    body: PluginInstallUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin", "owner")),
):
    """Actualiza configuración o estado activo/inactivo de un plugin."""
    svc = PluginsService(db, user.organization_id, user.id)
    install, plugin = await svc.update_install(
        install_id, is_active=body.is_active, config=body.config
    )
    return _install_to_response(install, plugin)


@router.delete("/{install_id}", status_code=204)
async def uninstall_plugin(
    install_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("admin", "owner")),
):
    """Desinstala un plugin de la organización."""
    svc = PluginsService(db, user.organization_id, user.id)
    await svc.uninstall_plugin(install_id)


# ─── Admin: Plugin Registry ─────────────────────────────────────────


@router.post("/registry", status_code=201)
async def register_plugin(
    body: PluginCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role("superadmin")),
):
    """Superadmin: registra un nuevo plugin en el sistema."""
    svc = PluginsService(db, user.organization_id, user.id)
    plugin = await svc.register_plugin(
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
    return _plugin_to_response(plugin)


@router.get("/registry/hooks")
async def list_valid_hooks(user=Depends(get_current_user)):
    """Lista todos los hook points válidos para desarrollo de plugins."""
    return {"hooks": sorted(VALID_HOOKS)}


# ─── Response helpers ────────────────────────────────────────────────


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
