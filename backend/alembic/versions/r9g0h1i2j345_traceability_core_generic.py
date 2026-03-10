"""traceability core — generic product batch model

Revision ID: r9g0h1i2j345
Revises: q8f9g0h1i234
Create Date: 2026-03-08

Migrates traceability_batches from egg-specific to generic product batch model.
Preserves all existing data by mapping old columns → new columns.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "r9g0h1i2j345"
down_revision = "q8f9g0h1i234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create enums explicitly (asyncpg safe) ──
    op.execute("DO $$ BEGIN CREATE TYPE productcategory AS ENUM ('eggs','poultry_meat','pork','beef','dairy','crops','feed','byproduct','other'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE batchstatus AS ENUM ('created','in_storage','in_transit','delivered','recalled','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # Add new generic columns
    op.add_column("traceability_batches", sa.Column(
        "product_category", sa.Enum("eggs","poultry_meat","pork","beef","dairy","crops","feed","byproduct","other", name="productcategory", create_type=False), server_default="eggs", nullable=False
    ))
    op.add_column("traceability_batches", sa.Column(
        "product_name", sa.String(200), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "product_type", sa.String(50), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "farm_id", UUID(as_uuid=True), sa.ForeignKey("farms.id", ondelete="SET NULL"), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "source_id", UUID(as_uuid=True), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "source_type", sa.String(50), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "origin_location", sa.String(100), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "quantity", sa.Integer, server_default="0", nullable=False
    ))
    op.add_column("traceability_batches", sa.Column(
        "unit_of_measure", sa.String(20), server_default="units", nullable=False
    ))
    op.add_column("traceability_batches", sa.Column(
        "container_count", sa.Integer, server_default="0", nullable=False
    ))
    op.add_column("traceability_batches", sa.Column(
        "units_per_container", sa.Integer, server_default="1", nullable=False
    ))
    op.add_column("traceability_batches", sa.Column(
        "quality_grade", sa.String(20), nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "weight_kg", sa.Float, nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "status", sa.Enum("created","in_storage","in_transit","delivered","recalled","expired", name="batchstatus", create_type=False), server_default="created", nullable=False
    ))
    op.add_column("traceability_batches", sa.Column(
        "best_before", sa.Date, nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "metadata", sa.JSON, nullable=True
    ))
    op.add_column("traceability_batches", sa.Column(
        "gl_entry_id", UUID(as_uuid=True),
        sa.ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True
    ))

    # Migrate existing egg data → new generic columns
    op.execute("""
        UPDATE traceability_batches SET
            product_category = 'eggs',
            source_id = flock_id,
            source_type = 'flock',
            origin_location = house,
            container_count = box_count,
            units_per_container = eggs_per_box,
            quantity = box_count * eggs_per_box,
            product_type = egg_type,
            unit_of_measure = 'units',
            status = 'created'
        WHERE flock_id IS NOT NULL
    """)

    # Create indexes
    op.create_index("ix_trace_batch_farm_id", "traceability_batches", ["farm_id"])
    op.create_index("ix_trace_batch_source_id", "traceability_batches", ["source_id"])
    op.create_index("ix_trace_batch_category", "traceability_batches", ["product_category"])

    # Drop old egg-specific columns (data migrated above)
    op.drop_constraint("traceability_batches_flock_id_fkey", "traceability_batches", type_="foreignkey")
    op.drop_index("ix_traceability_batches_flock_id", table_name="traceability_batches")
    op.drop_column("traceability_batches", "flock_id")
    op.drop_column("traceability_batches", "house")
    op.drop_column("traceability_batches", "rack_number")
    op.drop_column("traceability_batches", "box_count")
    op.drop_column("traceability_batches", "eggs_per_box")
    op.drop_column("traceability_batches", "egg_type")


def downgrade() -> None:
    # Restore egg-specific columns
    op.add_column("traceability_batches", sa.Column("flock_id", UUID(as_uuid=True), nullable=True))
    op.add_column("traceability_batches", sa.Column("house", sa.String(100), nullable=True))
    op.add_column("traceability_batches", sa.Column("rack_number", sa.String(50), nullable=True))
    op.add_column("traceability_batches", sa.Column("box_count", sa.Integer, server_default="0"))
    op.add_column("traceability_batches", sa.Column("eggs_per_box", sa.Integer, server_default="30"))
    op.add_column("traceability_batches", sa.Column("egg_type", sa.String(50), nullable=True))

    # Restore data
    op.execute("""
        UPDATE traceability_batches SET
            flock_id = source_id,
            house = origin_location,
            box_count = container_count,
            eggs_per_box = units_per_container,
            egg_type = product_type
        WHERE product_category = 'eggs'
    """)

    op.create_foreign_key(
        "traceability_batches_flock_id_fkey", "traceability_batches",
        "flocks", ["flock_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_traceability_batches_flock_id", "traceability_batches", ["flock_id"])

    # Drop new columns
    op.drop_index("ix_trace_batch_category", table_name="traceability_batches")
    op.drop_index("ix_trace_batch_source_id", table_name="traceability_batches")
    op.drop_index("ix_trace_batch_farm_id", table_name="traceability_batches")
    op.drop_column("traceability_batches", "gl_entry_id")
    op.drop_column("traceability_batches", "metadata")
    op.drop_column("traceability_batches", "best_before")
    op.drop_column("traceability_batches", "status")
    op.drop_column("traceability_batches", "weight_kg")
    op.drop_column("traceability_batches", "quality_grade")
    op.drop_column("traceability_batches", "units_per_container")
    op.drop_column("traceability_batches", "container_count")
    op.drop_column("traceability_batches", "unit_of_measure")
    op.drop_column("traceability_batches", "quantity")
    op.drop_column("traceability_batches", "origin_location")
    op.drop_column("traceability_batches", "source_type")
    op.drop_column("traceability_batches", "source_id")
    op.drop_column("traceability_batches", "farm_id")
    op.drop_column("traceability_batches", "product_type")
    op.drop_column("traceability_batches", "product_name")
    op.drop_column("traceability_batches", "product_category")
    op.execute("DROP TYPE IF EXISTS productcategory")
    op.execute("DROP TYPE IF EXISTS batchstatus")
