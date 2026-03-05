import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Forum Category ─────────────────────────────────────────────────


class ForumCategoryRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int
    is_active: bool
    locked: bool = False  # True if user's plan doesn't have access

    model_config = {"from_attributes": True}


# ── Forum Thread ───────────────────────────────────────────────────


class ForumThreadCreate(BaseModel):
    category_id: uuid.UUID
    title: str = Field(min_length=5, max_length=300)
    content: str = Field(min_length=10, max_length=10000)


class ForumThreadRead(BaseModel):
    id: uuid.UUID
    category_id: uuid.UUID
    author_id: uuid.UUID
    author_name: Optional[str] = None
    author_country: Optional[str] = None
    title: str
    status: str
    is_pinned: bool
    is_locked: bool
    view_count: int
    reply_count: int
    last_activity_at: datetime
    ai_tags: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ForumThreadDetail(ForumThreadRead):
    posts: list["ForumPostRead"] = []


# ── Forum Post ─────────────────────────────────────────────────────


class ForumPostCreate(BaseModel):
    thread_id: uuid.UUID
    content: str = Field(min_length=1, max_length=10000)
    parent_id: Optional[uuid.UUID] = None


class ForumPostUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class ForumPostRead(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    author_id: uuid.UUID
    author_name: Optional[str] = None
    author_country: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    content: str
    is_solution: bool
    likes_count: int
    moderation_status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Chat Room ──────────────────────────────────────────────────────


class ChatRoomRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    icon: Optional[str] = None
    is_active: bool
    online_count: int = 0
    locked: bool = False  # True if user's plan doesn't have access

    model_config = {"from_attributes": True}


# ── Chat Message ───────────────────────────────────────────────────


class ChatMessageCreate(BaseModel):
    room_id: uuid.UUID
    content: str = Field(min_length=1, max_length=2000)


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    author_id: uuid.UUID
    author_name: Optional[str] = None
    author_country: Optional[str] = None
    content: str
    moderation_status: str
    is_ai: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── AI Insight ─────────────────────────────────────────────────────


class AIInsightRead(BaseModel):
    id: uuid.UUID
    insight_type: str
    title: str
    description: str
    relevance_score: float
    occurrence_count: int
    is_actioned: bool
    actioned_note: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Community Stats ────────────────────────────────────────────────


class CommunityStats(BaseModel):
    total_threads: int
    total_posts: int
    total_chat_messages: int
    active_users_24h: int
    top_categories: list[dict]
    ai_insights_count: int
    countries_active: int
