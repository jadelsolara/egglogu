"""add_v3_tables

Revision ID: a2c3d4e5f678
Revises: 991ed48bc5a9
Create Date: 2026-02-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2c3d4e5f678'
down_revision: Union[str, None] = '991ed48bc5a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Users: add email verification + password reset columns ──
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('users', sa.Column('verification_token', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('reset_token', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('reset_token_expires', sa.DateTime(timezone=True), nullable=True))

    # ── DailyProduction: add egg_type + market_channel ──
    op.execute("CREATE TYPE eggtype AS ENUM ('conventional','free_range','organic','pasture_raised','decorative')")
    op.execute("CREATE TYPE marketchannel AS ENUM ('wholesale','supermarket','restaurant','direct','export','pasteurized')")
    op.add_column('daily_production', sa.Column('egg_type', sa.Enum('conventional','free_range','organic','pasture_raised','decorative', name='eggtype', create_type=False), nullable=True))
    op.add_column('daily_production', sa.Column('market_channel', sa.Enum('wholesale','supermarket','restaurant','direct','export','pasteurized', name='marketchannel', create_type=False), nullable=True))

    # ── Subscriptions ──
    op.execute("CREATE TYPE plantier AS ENUM ('free','pro','business','enterprise')")
    op.execute("CREATE TYPE subscriptionstatus AS ENUM ('active','cancelled','past_due')")
    op.create_table('subscriptions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('plan', sa.Enum('free','pro','business','enterprise', name='plantier', create_type=False), nullable=False),
        sa.Column('status', sa.Enum('active','cancelled','past_due', name='subscriptionstatus', create_type=False), nullable=False),
        sa.Column('stripe_customer_id', sa.String(length=100), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(length=100), nullable=True),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id'),
    )
    op.create_index(op.f('ix_subscriptions_organization_id'), 'subscriptions', ['organization_id'])

    # ── Biosecurity: risk_level, pest_type, protocol_frequency enums ──
    op.execute("CREATE TYPE risklevel AS ENUM ('green','yellow','red')")
    op.execute("CREATE TYPE pesttype AS ENUM ('rodent','fly','wild_bird','other')")
    op.execute("CREATE TYPE protocolfrequency AS ENUM ('daily','weekly','monthly')")

    # ── Biosecurity Visitors ──
    op.create_table('biosecurity_visitors',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('company', sa.String(length=200), nullable=True),
        sa.Column('purpose', sa.String(length=300), nullable=True),
        sa.Column('zone', sa.String(length=100), nullable=True),
        sa.Column('vehicle_plate', sa.String(length=20), nullable=True),
        sa.Column('disinfected', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('from_farm_health', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_biosecurity_visitors_date'), 'biosecurity_visitors', ['date'])
    op.create_index(op.f('ix_biosecurity_visitors_organization_id'), 'biosecurity_visitors', ['organization_id'])

    # ── Biosecurity Zones ──
    op.create_table('biosecurity_zones',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('risk_level', sa.Enum('green','yellow','red', name='risklevel', create_type=False), nullable=False),
        sa.Column('last_disinfection', sa.DateTime(timezone=True), nullable=True),
        sa.Column('frequency_days', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_biosecurity_zones_organization_id'), 'biosecurity_zones', ['organization_id'])

    # ── Pest Sightings ──
    op.create_table('pest_sightings',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('type', sa.Enum('rodent','fly','wild_bird','other', name='pesttype', create_type=False), nullable=False),
        sa.Column('location', sa.String(length=200), nullable=True),
        sa.Column('severity', sa.Integer(), nullable=False),
        sa.Column('action', sa.Text(), nullable=True),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pest_sightings_date'), 'pest_sightings', ['date'])
    op.create_index(op.f('ix_pest_sightings_organization_id'), 'pest_sightings', ['organization_id'])

    # ── Biosecurity Protocols ──
    op.create_table('biosecurity_protocols',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('frequency', sa.Enum('daily','weekly','monthly', name='protocolfrequency', create_type=False), nullable=False),
        sa.Column('last_completed', sa.DateTime(timezone=True), nullable=True),
        sa.Column('items_json', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_biosecurity_protocols_organization_id'), 'biosecurity_protocols', ['organization_id'])

    # ── Traceability Batches ──
    op.create_table('traceability_batches',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('flock_id', sa.Uuid(), nullable=False),
        sa.Column('house', sa.String(length=100), nullable=True),
        sa.Column('rack_number', sa.String(length=50), nullable=True),
        sa.Column('box_count', sa.Integer(), nullable=False),
        sa.Column('eggs_per_box', sa.Integer(), nullable=False),
        sa.Column('egg_type', sa.String(length=50), nullable=True),
        sa.Column('qr_code', sa.String(length=500), nullable=True),
        sa.Column('client_id', sa.Uuid(), nullable=True),
        sa.Column('delivery_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
        sa.ForeignKeyConstraint(['flock_id'], ['flocks.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_traceability_batches_date'), 'traceability_batches', ['date'])
    op.create_index(op.f('ix_traceability_batches_flock_id'), 'traceability_batches', ['flock_id'])
    op.create_index(op.f('ix_traceability_batches_organization_id'), 'traceability_batches', ['organization_id'])

    # ── Production Plans ──
    op.create_table('production_plans',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('target_date', sa.Date(), nullable=True),
        sa.Column('client_id', sa.Uuid(), nullable=True),
        sa.Column('eggs_needed', sa.Integer(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('flock_allocations_json', sa.Text(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_production_plans_organization_id'), 'production_plans', ['organization_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_production_plans_organization_id'), table_name='production_plans')
    op.drop_table('production_plans')

    op.drop_index(op.f('ix_traceability_batches_organization_id'), table_name='traceability_batches')
    op.drop_index(op.f('ix_traceability_batches_flock_id'), table_name='traceability_batches')
    op.drop_index(op.f('ix_traceability_batches_date'), table_name='traceability_batches')
    op.drop_table('traceability_batches')

    op.drop_index(op.f('ix_biosecurity_protocols_organization_id'), table_name='biosecurity_protocols')
    op.drop_table('biosecurity_protocols')

    op.drop_index(op.f('ix_pest_sightings_organization_id'), table_name='pest_sightings')
    op.drop_index(op.f('ix_pest_sightings_date'), table_name='pest_sightings')
    op.drop_table('pest_sightings')

    op.drop_index(op.f('ix_biosecurity_zones_organization_id'), table_name='biosecurity_zones')
    op.drop_table('biosecurity_zones')

    op.drop_index(op.f('ix_biosecurity_visitors_organization_id'), table_name='biosecurity_visitors')
    op.drop_index(op.f('ix_biosecurity_visitors_date'), table_name='biosecurity_visitors')
    op.drop_table('biosecurity_visitors')

    op.drop_index(op.f('ix_subscriptions_organization_id'), table_name='subscriptions')
    op.drop_table('subscriptions')

    op.drop_column('daily_production', 'market_channel')
    op.drop_column('daily_production', 'egg_type')
    op.execute("DROP TYPE IF EXISTS marketchannel")
    op.execute("DROP TYPE IF EXISTS eggtype")

    op.drop_column('users', 'reset_token_expires')
    op.drop_column('users', 'reset_token')
    op.drop_column('users', 'verification_token')
    op.drop_column('users', 'email_verified')

    op.execute("DROP TYPE IF EXISTS protocolfrequency")
    op.execute("DROP TYPE IF EXISTS pesttype")
    op.execute("DROP TYPE IF EXISTS risklevel")
    op.execute("DROP TYPE IF EXISTS subscriptionstatus")
    op.execute("DROP TYPE IF EXISTS plantier")
