import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey, Integer,
    String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


# ── Enums ──────────────────────────────────────────────────────────

class ThreadStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    pinned = "pinned"


class InsightType(str, enum.Enum):
    feature_request = "feature_request"
    pain_point = "pain_point"
    best_practice = "best_practice"
    trend = "trend"
    question = "question"


class ModerationAction(str, enum.Enum):
    approved = "approved"
    flagged = "flagged"
    removed = "removed"


# ── Forum Category ─────────────────────────────────────────────────

class ForumCategory(TimestampMixin, Base):
    """Global categories — not tenant-scoped (shared across all orgs)."""
    __tablename__ = "forum_categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    icon: Mapped[Optional[str]] = mapped_column(String(10), default=None)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ── Forum Thread ───────────────────────────────────────────────────

class ForumThread(TimestampMixin, Base):
    """A discussion thread created by a user."""
    __tablename__ = "forum_threads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("forum_categories.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[ThreadStatus] = mapped_column(
        Enum(ThreadStatus), default=ThreadStatus.open
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    reply_count: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # AI-extracted tags (comma-separated)
    ai_tags: Mapped[Optional[str]] = mapped_column(String(500), default=None)


# ── Forum Post (reply) ────────────────────────────────────────────

class ForumPost(TimestampMixin, Base):
    """A reply within a thread. First post = thread body."""
    __tablename__ = "forum_posts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("forum_threads.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("forum_posts.id", ondelete="SET NULL"), default=None
    )
    content: Mapped[str] = mapped_column(Text)
    is_solution: Mapped[bool] = mapped_column(Boolean, default=False)
    likes_count: Mapped[int] = mapped_column(Integer, default=0)
    # AI moderation
    moderation_status: Mapped[ModerationAction] = mapped_column(
        Enum(ModerationAction), default=ModerationAction.approved
    )
    moderation_reason: Mapped[Optional[str]] = mapped_column(Text, default=None)


# ── Post Like ──────────────────────────────────────────────────────

class PostLike(TimestampMixin, Base):
    """User likes on forum posts."""
    __tablename__ = "post_likes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("forum_posts.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )


# ── Chat Room ──────────────────────────────────────────────────────

class ChatRoom(TimestampMixin, Base):
    """Global chat rooms (topic-based). Not tenant-scoped."""
    __tablename__ = "chat_rooms"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("forum_categories.id", ondelete="SET NULL"), default=None
    )
    icon: Mapped[Optional[str]] = mapped_column(String(10), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    max_messages_per_min: Mapped[int] = mapped_column(Integer, default=10)


# ── Chat Message ───────────────────────────────────────────────────

class ChatMessage(TimestampMixin, Base):
    """A message in a chat room."""
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    # AI moderation
    moderation_status: Mapped[ModerationAction] = mapped_column(
        Enum(ModerationAction), default=ModerationAction.approved
    )
    moderation_reason: Mapped[Optional[str]] = mapped_column(Text, default=None)
    # For AI bot messages
    is_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    # Country from user profile for timezone/geographic analytics
    author_country: Mapped[Optional[str]] = mapped_column(String(3), default=None)


# ── AI Insight (extracted from conversations) ─────────────────────

class AIInsight(TimestampMixin, Base):
    """AI-extracted insights from forum threads and chat messages."""
    __tablename__ = "ai_insights"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    insight_type: Mapped[InsightType] = mapped_column(Enum(InsightType), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    source_thread_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("forum_threads.id", ondelete="SET NULL"), default=None
    )
    source_room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("chat_rooms.id", ondelete="SET NULL"), default=None
    )
    relevance_score: Mapped[float] = mapped_column(Float, default=0.0)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)
    is_actioned: Mapped[bool] = mapped_column(Boolean, default=False)
    actioned_note: Mapped[Optional[str]] = mapped_column(Text, default=None)
