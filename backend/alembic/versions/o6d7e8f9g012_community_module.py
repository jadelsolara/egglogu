"""community module - forum + chatroom + AI moderation

Revision ID: o6d7e8f9g012
Revises: n5c6d7e8f901
Create Date: 2026-03-05

"""

from alembic import op
import sqlalchemy as sa

revision = "o6d7e8f9g012"
down_revision = "n5c6d7e8f901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Forum categories (global, not tenant-scoped)
    op.create_table(
        "forum_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    # Forum threads
    op.create_table(
        "forum_threads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ai_tags", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["forum_categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_forum_threads_category", "forum_threads", ["category_id"])
    op.create_index("ix_forum_threads_author", "forum_threads", ["author_id"])
    op.create_index("ix_forum_threads_activity", "forum_threads", ["last_activity_at"])

    # Forum posts
    op.create_table(
        "forum_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_solution", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("likes_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("moderation_status", sa.String(20), nullable=False, server_default="approved"),
        sa.Column("moderation_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["forum_threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["forum_posts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_forum_posts_thread", "forum_posts", ["thread_id"])
    op.create_index("ix_forum_posts_author", "forum_posts", ["author_id"])

    # Post likes
    op.create_table(
        "post_likes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("post_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["post_id"], ["forum_posts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("post_id", "user_id", name="uq_post_likes_post_user"),
    )
    op.create_index("ix_post_likes_post", "post_likes", ["post_id"])
    op.create_index("ix_post_likes_user", "post_likes", ["user_id"])

    # Chat rooms
    op.create_table(
        "chat_rooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("slug", sa.String(200), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("icon", sa.String(10), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("max_messages_per_min", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["forum_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Chat messages
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("moderation_status", sa.String(20), nullable=False, server_default="approved"),
        sa.Column("moderation_reason", sa.Text(), nullable=True),
        sa.Column("is_ai", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("author_country", sa.String(3), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["room_id"], ["chat_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_messages_room", "chat_messages", ["room_id", "created_at"])
    op.create_index("ix_chat_messages_author", "chat_messages", ["author_id"])
    op.create_index("ix_chat_messages_country", "chat_messages", ["author_country"])

    # AI Insights
    op.create_table(
        "ai_insights",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("insight_type", sa.String(30), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source_thread_id", sa.Uuid(), nullable=True),
        sa.Column("source_room_id", sa.Uuid(), nullable=True),
        sa.Column("relevance_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_actioned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("actioned_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_thread_id"], ["forum_threads.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_room_id"], ["chat_rooms.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_insights_type", "ai_insights", ["insight_type"])

    # Seed default categories and chat rooms
    op.execute("""
        INSERT INTO forum_categories (id, name, slug, description, icon, sort_order) VALUES
        (gen_random_uuid(), 'Suggestions', 'suggestions', 'Feature requests and ideas for FarmLogU products', '💡', 1),
        (gen_random_uuid(), 'General Discussion', 'general', 'Open discussion about farm production', '💬', 2),
        (gen_random_uuid(), 'Nutrition & Feed', 'nutrition-feed', 'Diets, supplements, feed formulation', '🌾', 3),
        (gen_random_uuid(), 'Health & Disease', 'health-disease', 'Vaccines, treatments, disease prevention', '🏥', 4),
        (gen_random_uuid(), 'Genetics & Breeding', 'genetics-breeding', 'Breed selection, genetic improvement', '🧬', 5),
        (gen_random_uuid(), 'Animal Welfare', 'animal-welfare', 'Welfare standards, enrichment, behavior', '🐔', 6),
        (gen_random_uuid(), 'Market & Sales', 'market-sales', 'Pricing, buyers, market trends', '📈', 7),
        (gen_random_uuid(), 'Housing & Equipment', 'housing-equipment', 'Coops, ventilation, automation', '🏗️', 8),
        (gen_random_uuid(), 'Biosecurity', 'biosecurity', 'Protocols, quarantine, pest control', '🛡️', 9),
        (gen_random_uuid(), 'Pork Production', 'pork-production', 'Swine farming, feed, health, genetics', '🐷', 10),
        (gen_random_uuid(), 'Cattle Production', 'cattle-production', 'Beef and dairy farming discussions', '🐄', 11),
        (gen_random_uuid(), 'Crop Agriculture', 'crop-agriculture', 'Crops, irrigation, soil management', '🌱', 12)
    """)

    op.execute("""
        INSERT INTO chat_rooms (id, name, slug, description, icon) VALUES
        (gen_random_uuid(), 'General Chat', 'general', 'Open discussion about farm production', '💬'),
        (gen_random_uuid(), 'Suggestions', 'suggestions', 'Ideas and feature requests for FarmLogU', '💡'),
        (gen_random_uuid(), 'Technical Help', 'technical-help', 'Get help with EGGlogU features', '🔧'),
        (gen_random_uuid(), 'Market Watch', 'market-watch', 'Real-time market prices and trends', '📊'),
        (gen_random_uuid(), 'Newcomers', 'newcomers', 'Welcome! Ask anything about getting started', '👋')
    """)


def downgrade() -> None:
    op.drop_table("ai_insights")
    op.drop_table("chat_messages")
    op.drop_table("chat_rooms")
    op.drop_table("post_likes")
    op.drop_table("forum_posts")
    op.drop_table("forum_threads")
    op.drop_table("forum_categories")
