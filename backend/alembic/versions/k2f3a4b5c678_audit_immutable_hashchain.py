"""Add hash-chain fields to audit_logs for immutable audit trail

Revision ID: k2f3a4b5c678
Revises: j1e2f3a4b567
Create Date: 2026-03-03 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k2f3a4b5c678"
down_revision: Union[str, None] = "j1e2f3a4b567"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns for hash-chain audit trail
    op.add_column("audit_logs", sa.Column("table_name", sa.String(100), nullable=True))
    op.add_column("audit_logs", sa.Column("record_id", sa.String(50), nullable=True))
    op.add_column("audit_logs", sa.Column("old_values", sa.JSON(), nullable=True))
    op.add_column("audit_logs", sa.Column("new_values", sa.JSON(), nullable=True))
    op.add_column("audit_logs", sa.Column("hash", sa.String(64), nullable=True))
    op.add_column("audit_logs", sa.Column("prev_hash", sa.String(64), nullable=True, server_default="0" * 64))

    # Backfill existing rows: copy resource→table_name, resource_id→record_id
    op.execute("UPDATE audit_logs SET table_name = resource WHERE table_name IS NULL")
    op.execute("UPDATE audit_logs SET record_id = resource_id WHERE record_id IS NULL")
    op.execute(
        "UPDATE audit_logs SET hash = encode(sha256(id::text::bytea), 'hex') WHERE hash IS NULL"
    )
    op.execute(
        "UPDATE audit_logs SET prev_hash = '0000000000000000000000000000000000000000000000000000000000000000' "
        "WHERE prev_hash IS NULL"
    )

    # Create indexes for new columns
    op.create_index("ix_audit_logs_table_name", "audit_logs", ["table_name"])
    op.create_index("ix_audit_logs_record_id", "audit_logs", ["record_id"])
    op.create_index("ix_audit_logs_hash", "audit_logs", ["hash"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    # Revoke UPDATE and DELETE on audit_logs from the app user.
    # This makes the audit trail INSERT-only (immutable).
    # NOTE: This requires the migration to run as a superuser or the table owner.
    # If running as the app user, this will be a no-op and should be done manually.
    op.execute("""
        DO $$
        BEGIN
            EXECUTE 'REVOKE UPDATE, DELETE ON audit_logs FROM egglogu';
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not revoke privileges on audit_logs - run manually as superuser';
        END
        $$;
    """)


def downgrade() -> None:
    # Re-grant UPDATE and DELETE
    op.execute("""
        DO $$
        BEGIN
            EXECUTE 'GRANT UPDATE, DELETE ON audit_logs TO egglogu';
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END
        $$;
    """)

    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_hash", table_name="audit_logs")
    op.drop_index("ix_audit_logs_record_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_table_name", table_name="audit_logs")

    op.drop_column("audit_logs", "prev_hash")
    op.drop_column("audit_logs", "hash")
    op.drop_column("audit_logs", "new_values")
    op.drop_column("audit_logs", "old_values")
    op.drop_column("audit_logs", "record_id")
    op.drop_column("audit_logs", "table_name")
