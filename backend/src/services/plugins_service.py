"""PluginsService — Marketplace, instalación y registro de plugins."""

import uuid

from fastapi import HTTPException
from sqlalchemy import select, func

from src.core.plugins import VALID_HOOKS
from src.models.plugin import Plugin, PluginInstall
from src.services.base import BaseService


class PluginsService(BaseService):
    """Operaciones CRUD y lógica de negocio para plugins."""

    # ── Marketplace (plugins públicos) ────────────────────────────────

    async def list_marketplace(
        self, *, page: int = 1, size: int = 20, search: str | None = None
    ) -> dict:
        """Lista plugins públicos disponibles para instalación."""
        query = select(Plugin).where(Plugin.is_public.is_(True))
        if search:
            query = query.where(
                Plugin.name.ilike(f"%{search}%")
                | Plugin.description.ilike(f"%{search}%")
            )
        query = query.order_by(Plugin.name).offset((page - 1) * size).limit(size)
        result = await self.db.execute(query)
        plugins = result.scalars().all()

        count_q = select(func.count(Plugin.id)).where(Plugin.is_public.is_(True))
        if search:
            count_q = count_q.where(
                Plugin.name.ilike(f"%{search}%")
                | Plugin.description.ilike(f"%{search}%")
            )
        total = (await self.db.execute(count_q)).scalar()

        return {"items": plugins, "total": total, "page": page, "size": size}

    # ── Plugins instalados (org-scoped) ───────────────────────────────

    async def list_installed(self, *, page: int = 1, size: int = 20) -> dict:
        """Lista plugins instalados para la organización."""
        offset = (page - 1) * size
        result = await self.db.execute(
            select(PluginInstall, Plugin)
            .join(Plugin, PluginInstall.plugin_id == Plugin.id)
            .where(PluginInstall.organization_id == self.org_id)
            .order_by(PluginInstall.created_at.desc())
            .offset(offset)
            .limit(size)
        )
        rows = result.all()

        count_result = await self.db.execute(
            select(func.count(PluginInstall.id)).where(
                PluginInstall.organization_id == self.org_id
            )
        )
        total = count_result.scalar()

        return {"rows": rows, "total": total, "page": page, "size": size}

    async def install_plugin(
        self, plugin_id: uuid.UUID, config: dict | None = None
    ) -> tuple[PluginInstall, Plugin]:
        """Instala un plugin para la organización."""
        plugin = await self._get_plugin_or_404(plugin_id)

        # Verificar que no esté ya instalado
        existing = await self.db.execute(
            select(PluginInstall).where(
                PluginInstall.plugin_id == plugin_id,
                PluginInstall.organization_id == self.org_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Plugin already installed")

        install = PluginInstall(
            plugin_id=plugin_id,
            organization_id=self.org_id,
            installed_by=self.user_id,
            config=config,
            is_active=True,
        )
        self.db.add(install)
        await self.db.commit()
        await self.db.refresh(install)

        return install, plugin

    async def get_install(self, install_id: uuid.UUID) -> tuple[PluginInstall, Plugin]:
        """Obtiene detalle de un plugin instalado."""
        return await self._get_install_or_404(install_id)

    async def update_install(
        self,
        install_id: uuid.UUID,
        is_active: bool | None = None,
        config: dict | None = None,
    ) -> tuple[PluginInstall, Plugin]:
        """Actualiza configuración o estado activo/inactivo de un plugin."""
        install, plugin = await self._get_install_or_404(install_id)

        if is_active is not None:
            install.is_active = is_active
        if config is not None:
            install.config = config

        await self.db.commit()
        await self.db.refresh(install)
        return install, plugin

    async def uninstall_plugin(self, install_id: uuid.UUID) -> None:
        """Desinstala un plugin de la organización."""
        install, _ = await self._get_install_or_404(install_id)
        await self.db.delete(install)
        await self.db.commit()

    # ── Registro de plugins (superadmin) ──────────────────────────────

    async def register_plugin(
        self,
        slug: str,
        name: str,
        version: str,
        description: str | None,
        author: str | None,
        hooks: list[str],
        permissions: list[str],
        config_schema: dict | None,
        is_public: bool,
    ) -> Plugin:
        """Registra un nuevo plugin en el sistema (superadmin)."""
        # Validar hooks
        invalid = set(hooks) - VALID_HOOKS
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid hooks: {', '.join(invalid)}. Valid: {', '.join(sorted(VALID_HOOKS))}",
            )

        # Verificar unicidad del slug
        existing = await self.db.execute(select(Plugin).where(Plugin.slug == slug))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409, detail=f"Plugin slug '{slug}' already exists"
            )

        plugin = Plugin(
            slug=slug,
            name=name,
            version=version,
            description=description,
            author=author,
            hooks=hooks,
            permissions=permissions,
            config_schema=config_schema,
            is_public=is_public,
        )
        self.db.add(plugin)
        await self.db.commit()
        await self.db.refresh(plugin)
        return plugin

    # ── Helpers internos ──────────────────────────────────────────────

    async def _get_plugin_or_404(self, plugin_id: uuid.UUID) -> Plugin:
        result = await self.db.execute(select(Plugin).where(Plugin.id == plugin_id))
        plugin = result.scalar_one_or_none()
        if not plugin:
            raise HTTPException(status_code=404, detail="Plugin not found")
        return plugin

    async def _get_install_or_404(
        self, install_id: uuid.UUID
    ) -> tuple[PluginInstall, Plugin]:
        result = await self.db.execute(
            select(PluginInstall, Plugin)
            .join(Plugin, PluginInstall.plugin_id == Plugin.id)
            .where(
                PluginInstall.id == install_id,
                PluginInstall.organization_id == self.org_id,
            )
        )
        row = result.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="Plugin install not found")
        return row[0], row[1]
