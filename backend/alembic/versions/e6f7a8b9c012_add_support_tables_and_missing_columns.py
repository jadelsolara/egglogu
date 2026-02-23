"""add support tables, subscription columns, utm fields, suspended status

Revision ID: e6f7a8b9c012
Revises: d5e6f7a8b901
Create Date: 2026-02-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6f7a8b9c012'
down_revision: Union[str, None] = 'd5e6f7a8b901'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add 'suspended' to subscriptionstatus enum ──
    op.execute("ALTER TYPE subscriptionstatus ADD VALUE IF NOT EXISTS 'suspended'")

    # ── Add missing subscription columns ──
    op.add_column('subscriptions', sa.Column('is_trial', sa.Boolean(), nullable=False, server_default=sa.text('true')))
    op.add_column('subscriptions', sa.Column('trial_end', sa.DateTime(timezone=True), nullable=True))
    op.add_column('subscriptions', sa.Column('discount_phase', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('subscriptions', sa.Column('months_subscribed', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('subscriptions', sa.Column('billing_interval', sa.String(length=10), nullable=False, server_default=sa.text("'month'")))

    # ── Add missing UTM columns to users ──
    op.add_column('users', sa.Column('utm_source', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('utm_medium', sa.String(length=200), nullable=True))
    op.add_column('users', sa.Column('utm_campaign', sa.String(length=200), nullable=True))

    # ── Support enums ──
    op.execute("DO $$ BEGIN CREATE TYPE ticketstatus AS ENUM ('open','in_progress','waiting_user','resolved','closed'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE ticketpriority AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("DO $$ BEGIN CREATE TYPE ticketcategory AS ENUM ('produccion','sanidad','alimento','iot','billing','bug','sync','feature_request','acceso','general'); EXCEPTION WHEN duplicate_object THEN null; END $$")

    # ── FAQ Articles (must be created before support_tickets due to FK) ──
    op.create_table('faq_articles',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('category', sa.Enum('produccion','sanidad','alimento','iot','billing','bug','sync','feature_request','acceso','general', name='ticketcategory', create_type=False), nullable=False),
        sa.Column('title_es', sa.String(length=300), nullable=False),
        sa.Column('title_en', sa.String(length=300), nullable=False),
        sa.Column('content_es', sa.Text(), nullable=False),
        sa.Column('content_en', sa.Text(), nullable=False),
        sa.Column('keywords', sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column('helpful_yes', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('helpful_no', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── Support Tickets ──
    op.create_table('support_tickets',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('ticket_number', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('subject', sa.String(length=300), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.Enum('produccion','sanidad','alimento','iot','billing','bug','sync','feature_request','acceso','general', name='ticketcategory', create_type=False), nullable=False),
        sa.Column('priority', sa.Enum('low','medium','high','critical', name='ticketpriority', create_type=False), nullable=False),
        sa.Column('status', sa.Enum('open','in_progress','waiting_user','resolved','closed', name='ticketstatus', create_type=False), nullable=False),
        sa.Column('sla_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('suggested_faq_id', sa.Uuid(), nullable=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['suggested_faq_id'], ['faq_articles.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_support_tickets_ticket_number'), 'support_tickets', ['ticket_number'], unique=True)
    op.create_index(op.f('ix_support_tickets_user_id'), 'support_tickets', ['user_id'])
    op.create_index(op.f('ix_support_tickets_organization_id'), 'support_tickets', ['organization_id'])

    # ── Ticket Messages ──
    op.create_table('ticket_messages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('ticket_id', sa.Uuid(), nullable=False),
        sa.Column('sender_id', sa.Uuid(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_internal', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_ticket_messages_ticket_id'), 'ticket_messages', ['ticket_id'])

    # ── Support Ratings ──
    op.create_table('support_ratings',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('ticket_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ticket_id'),
    )

    # ── Auto Responses ──
    op.create_table('auto_responses',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('category', sa.Enum('produccion','sanidad','alimento','iot','billing','bug','sync','feature_request','acceso','general', name='ticketcategory', create_type=False), nullable=False),
        sa.Column('trigger_keywords', sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column('response_es', sa.Text(), nullable=False),
        sa.Column('response_en', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_auto_responses_category'), 'auto_responses', ['category'])


def downgrade() -> None:
    op.drop_index(op.f('ix_auto_responses_category'), table_name='auto_responses')
    op.drop_table('auto_responses')

    op.drop_table('support_ratings')

    op.drop_index(op.f('ix_ticket_messages_ticket_id'), table_name='ticket_messages')
    op.drop_table('ticket_messages')

    op.drop_index(op.f('ix_support_tickets_organization_id'), table_name='support_tickets')
    op.drop_index(op.f('ix_support_tickets_user_id'), table_name='support_tickets')
    op.drop_index(op.f('ix_support_tickets_ticket_number'), table_name='support_tickets')
    op.drop_table('support_tickets')

    op.drop_table('faq_articles')

    op.execute("DROP TYPE IF EXISTS ticketcategory")
    op.execute("DROP TYPE IF EXISTS ticketpriority")
    op.execute("DROP TYPE IF EXISTS ticketstatus")

    op.drop_column('users', 'utm_campaign')
    op.drop_column('users', 'utm_medium')
    op.drop_column('users', 'utm_source')

    op.drop_column('subscriptions', 'billing_interval')
    op.drop_column('subscriptions', 'months_subscribed')
    op.drop_column('subscriptions', 'discount_phase')
    op.drop_column('subscriptions', 'trial_end')
    op.drop_column('subscriptions', 'is_trial')

    # Note: 'suspended' value cannot be removed from PostgreSQL enum
