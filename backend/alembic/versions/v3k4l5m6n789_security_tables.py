"""security tables — login_audit_log, user_sessions, user_totp, known_devices

Revision ID: v3k4l5m6n789
Revises: u2j3k4l5m678
Create Date: 2026-03-10

Adds the four security tables and their enum types (loginresult, sessionstatus).
These tables were defined in src/models/security.py but never had a migration.
Uses IF NOT EXISTS because the tables may have been created by create_all().
"""

from alembic import op

revision = "v3k4l5m6n789"
down_revision = "u2j3k4l5m678"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create enum types (idempotent) ──
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE loginresult AS ENUM (
                'success', 'bad_creds', 'locked_out', 'needs_2fa', 'unverified', 'disabled'
            );
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE sessionstatus AS ENUM ('active', 'revoked', 'expired');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)

    # ── 1. login_audit_log ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS login_audit_log (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            email VARCHAR(320) NOT NULL,
            result loginresult NOT NULL,
            ip_address VARCHAR(45) NOT NULL,
            user_agent TEXT,
            geo_country VARCHAR(100),
            geo_city VARCHAR(200),
            geo_lat DOUBLE PRECISION,
            geo_lng DOUBLE PRECISION,
            method VARCHAR(20) NOT NULL DEFAULT 'credentials',
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_login_audit_log_user_id ON login_audit_log (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_login_audit_log_email ON login_audit_log (email);")

    # ── 2. user_sessions ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            refresh_token_jti VARCHAR(64) NOT NULL UNIQUE,
            ip_address VARCHAR(45) NOT NULL,
            user_agent TEXT,
            device_name VARCHAR(200),
            geo_country VARCHAR(100),
            geo_city VARCHAR(200),
            last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            status sessionstatus NOT NULL DEFAULT 'active',
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_sessions_jti ON user_sessions (refresh_token_jti);")

    # ── 3. user_totp ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_totp (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            encrypted_seed VARCHAR(500) NOT NULL,
            is_enabled BOOLEAN NOT NULL DEFAULT false,
            backup_codes_hash TEXT,
            backup_codes_used INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_totp_user_id ON user_totp (user_id);")

    # ── 4. known_devices ──
    op.execute("""
        CREATE TABLE IF NOT EXISTS known_devices (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_fingerprint VARCHAR(64) NOT NULL,
            ip_address VARCHAR(45) NOT NULL,
            user_agent TEXT,
            device_name VARCHAR(200),
            geo_country VARCHAR(100),
            geo_city VARCHAR(200),
            last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_known_devices_user_id ON known_devices (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_known_devices_fingerprint ON known_devices (device_fingerprint);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS known_devices")
    op.execute("DROP TABLE IF EXISTS user_totp")
    op.execute("DROP TABLE IF EXISTS user_sessions")
    op.execute("DROP TABLE IF EXISTS login_audit_log")
    op.execute("DROP TYPE IF EXISTS sessionstatus")
    op.execute("DROP TYPE IF EXISTS loginresult")
