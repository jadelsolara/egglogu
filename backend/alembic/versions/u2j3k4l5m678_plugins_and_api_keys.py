"""plugins and api_keys tables

Revision ID: u2j3k4l5m678
Revises: t1i2j3k4l567
Create Date: 2026-03-09

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "u2j3k4l5m678"
down_revision = "t1i2j3k4l567"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Plugins (global registry) ──
    op.create_table(
        "plugins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("version", sa.String(20), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("author", sa.String(200), nullable=True),
        sa.Column("hooks", sa.JSON, server_default="[]", nullable=False),
        sa.Column("permissions", sa.JSON, server_default="[]", nullable=False),
        sa.Column("config_schema", sa.JSON, nullable=True),
        sa.Column("is_public", sa.Boolean, server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plugins_slug", "plugins", ["slug"])

    # ── Plugin Installs (per-organization) ──
    op.create_table(
        "plugin_installs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plugin_id", UUID(as_uuid=True),
                  sa.ForeignKey("plugins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("config", sa.JSON, nullable=True),
        sa.Column("installed_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plugin_installs_org", "plugin_installs", ["organization_id"])
    op.create_index("ix_plugin_installs_plugin", "plugin_installs", ["plugin_id"])

    # ── API Keys ──
    op.create_table(
        "api_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("key_prefix", sa.String(8), nullable=False),
        sa.Column("key_hash", sa.String(128), unique=True, nullable=False),
        sa.Column("scopes", sa.JSON, server_default="[]", nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_ip", sa.String(50), nullable=True),
        sa.Column("total_requests", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_api_keys_org", "api_keys", ["organization_id"])
    op.create_index("ix_api_keys_prefix", "api_keys", ["key_prefix"])


def downgrade() -> None:
    op.drop_table("api_keys")
    op.drop_table("plugin_installs")
    op.drop_table("plugins")
