"""Community module: Forum threads + Chat rooms with AI moderation.

Global (cross-tenant) — users from all organizations participate together.
AI moderator runs on every new post/message to flag content and extract insights.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_org_plan
from src.database import get_db
from src.models.auth import User
from src.schemas.community import (
    AIInsightRead,
    ChatMessageCreate,
    ChatMessageRead,
    ChatRoomRead,
    CommunityStats,
    ForumCategoryRead,
    ForumPostCreate,
    ForumPostRead,
    ForumPostUpdate,
    ForumThreadCreate,
    ForumThreadDetail,
    ForumThreadRead,
)
from src.services.community_service import CommunityService

router = APIRouter(prefix="/community", tags=["community"])


def _svc(db: AsyncSession, user: User) -> CommunityService:
    return CommunityService(db, user.organization_id, user.id)


# ── Forum Categories ──────────────────────────────────────────────


@router.get("/categories", response_model=list[ForumCategoryRead])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    svc = _svc(db, user)
    return await svc.list_categories(plan)


# ── Forum Threads ─────────────────────────────────────────────────


@router.get("/threads", response_model=list[ForumThreadRead])
async def list_threads(
    category_id: uuid.UUID | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    svc = _svc(db, user)
    return await svc.list_threads(plan, category_id, search, page, size)


@router.get("/threads/{thread_id}", response_model=ForumThreadDetail)
async def get_thread(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = _svc(db, user)
    return await svc.get_thread(thread_id)


@router.post("/threads", response_model=ForumThreadRead, status_code=201)
async def create_thread(
    data: ForumThreadCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    svc = _svc(db, user)
    return await svc.create_thread(
        data.category_id, data.title, data.content, plan, user.full_name
    )


# ── Forum Posts ───────────────────────────────────────────────────


@router.post("/posts", response_model=ForumPostRead, status_code=201)
async def create_post(
    data: ForumPostCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    svc = _svc(db, user)
    return await svc.create_post(
        data.thread_id, data.content, plan, user.full_name, data.parent_id
    )


@router.put("/posts/{post_id}", response_model=ForumPostRead)
async def update_post(
    post_id: uuid.UUID,
    data: ForumPostUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = _svc(db, user)
    return await svc.update_post(post_id, data.content, user.full_name)


@router.post("/posts/{post_id}/like", status_code=200)
async def toggle_like(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = _svc(db, user)
    return await svc.toggle_like(post_id)


# ── Chat Rooms ────────────────────────────────────────────────────


@router.get("/rooms", response_model=list[ChatRoomRead])
async def list_rooms(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    svc = _svc(db, user)
    return await svc.list_rooms(plan)


@router.get("/rooms/{room_id}/messages", response_model=list[ChatMessageRead])
async def list_messages(
    room_id: uuid.UUID,
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = _svc(db, user)
    return await svc.list_messages(room_id, before, limit)


@router.post(
    "/rooms/{room_id}/messages", response_model=ChatMessageRead, status_code=201
)
async def send_message(
    room_id: uuid.UUID,
    data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    svc = _svc(db, user)
    return await svc.send_message(
        room_id,
        data.content,
        plan,
        user.full_name,
        getattr(user, "country", None),
    )


# ── AI Insights (superadmin / internal) ───────────────────────────


@router.get("/insights", response_model=list[AIInsightRead])
async def list_insights(
    insight_type: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = _svc(db, user)
    return await svc.list_insights(insight_type, limit)


# ── Community Stats ───────────────────────────────────────────────


@router.get("/stats", response_model=CommunityStats)
async def community_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    svc = _svc(db, user)
    return await svc.community_stats()
