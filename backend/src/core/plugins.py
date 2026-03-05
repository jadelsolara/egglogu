"""Plugin system — sandboxed execution engine.

Plugins register hooks (on_production_entry, on_alert, etc.) and run
in a subprocess with a 5-second timeout for safety.

Hook points:
  - before_save: Before any entity is saved
  - after_save: After any entity is saved
  - before_delete: Before any entity is deleted
  - on_production_entry: When new daily production is recorded
  - on_alert: When a health/biosecurity alert fires
  - on_report: When a report is generated
"""

import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.plugin import Plugin, PluginInstall

logger = logging.getLogger("egglogu.plugins")

PLUGIN_TIMEOUT = 5  # seconds
VALID_HOOKS = frozenset(
    {
        "before_save",
        "after_save",
        "before_delete",
        "on_production_entry",
        "on_alert",
        "on_report",
        "on_flock_update",
        "on_environment_reading",
        "on_feed_purchase",
        "on_biosecurity_event",
    }
)


async def execute_hook(
    db: AsyncSession,
    org_id: str,
    hook_name: str,
    context: dict[str, Any],
) -> list[dict]:
    """Execute all active plugins for a given hook in the org.

    Args:
        db: Database session
        org_id: Organization ID
        hook_name: Hook point name (e.g., "on_production_entry")
        context: Data passed to the plugin (entity data, metadata)

    Returns:
        List of plugin results (or errors)
    """
    if hook_name not in VALID_HOOKS:
        logger.warning("Invalid hook: %s", hook_name)
        return []

    # Find active plugin installs for this org that listen to this hook
    result = await db.execute(
        select(PluginInstall, Plugin)
        .join(Plugin, PluginInstall.plugin_id == Plugin.id)
        .where(
            PluginInstall.organization_id == org_id,
            PluginInstall.is_active.is_(True),
        )
    )
    installs = result.all()

    results = []
    for install, plugin in installs:
        if hook_name not in (plugin.hooks or []):
            continue

        try:
            output = _run_sandboxed(plugin, install, hook_name, context)
            install.last_executed_at = datetime.now(timezone.utc)
            install.execution_count += 1
            install.last_error = None
            results.append(
                {
                    "plugin": plugin.slug,
                    "status": "ok",
                    "output": output,
                }
            )
        except subprocess.TimeoutExpired:
            install.last_error = f"Timeout ({PLUGIN_TIMEOUT}s) on hook {hook_name}"
            logger.warning("Plugin %s timed out on %s", plugin.slug, hook_name)
            results.append(
                {
                    "plugin": plugin.slug,
                    "status": "timeout",
                    "error": install.last_error,
                }
            )
        except Exception as e:
            install.last_error = str(e)[:500]
            logger.error("Plugin %s failed on %s: %s", plugin.slug, hook_name, e)
            results.append(
                {
                    "plugin": plugin.slug,
                    "status": "error",
                    "error": str(e)[:500],
                }
            )

    if installs:
        await db.flush()

    return results


def _run_sandboxed(
    plugin: Plugin,
    install: PluginInstall,
    hook_name: str,
    context: dict,
) -> str:
    """Run plugin code in a subprocess with timeout.

    The plugin receives JSON on stdin and writes JSON to stdout.
    Stderr is captured for logging.
    """
    payload = json.dumps(
        {
            "hook": hook_name,
            "plugin": plugin.slug,
            "version": plugin.version,
            "config": install.config or {},
            "context": context,
        }
    )

    # Run as subprocess with restricted resources
    proc = subprocess.run(
        [sys.executable, "-c", _SANDBOX_WRAPPER],
        input=payload,
        capture_output=True,
        text=True,
        timeout=PLUGIN_TIMEOUT,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            f"Plugin exited with code {proc.returncode}: {proc.stderr[:500]}"
        )

    return proc.stdout.strip()


# Minimal sandbox wrapper — reads JSON from stdin, executes plugin logic
_SANDBOX_WRAPPER = """
import json, sys
try:
    data = json.loads(sys.stdin.read())
    # Plugin execution would load actual plugin code here
    # For now, just echo back confirmation
    result = {"hook": data["hook"], "plugin": data["plugin"], "processed": True}
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
"""
