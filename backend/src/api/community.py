"""Community module: Forum threads + Chat rooms with AI moderation.

Global (cross-tenant) — users from all organizations participate together.
AI moderator runs on every new post/message to flag content and extract insights.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_org_plan
from src.core.exceptions import ForbiddenError, NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.community import (
    AIInsight,
    ChatMessage,
    ChatRoom,
    ForumCategory,
    ForumPost,
    ForumThread,
    ModerationAction,
    PostLike,
)
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

logger = logging.getLogger("egglogu.community")

router = APIRouter(prefix="/community", tags=["community"])


# ── AI Moderation Helper ──────────────────────────────────────────
# Simple keyword-based moderation. Replace with LLM call for production.

_BLOCKED_PATTERNS = [
    "spam", "scam", "buy now", "click here", "free money",
    # Add more as needed — or integrate with an LLM moderation API
]


# ── Plan-based Forum Access (Cascade) ─────────────────────────────
# Higher tiers can access all categories up to their level.
# Open to ALL: general, suggestions, FarmLogU sectors (demand generation).
# EGGlogU-specific categories gated by tier.

_OPEN_CATS = {"general", "suggestions", "pork-production", "cattle-production", "crop-agriculture"}

PLAN_FORUM_ACCESS = {
    "suspended": _OPEN_CATS,
    "hobby": _OPEN_CATS | {"nutrition-feed"},
    "starter": _OPEN_CATS | {"nutrition-feed", "health-disease", "market-sales", "housing-equipment"},
    "pro": _OPEN_CATS | {"nutrition-feed", "health-disease", "market-sales", "housing-equipment",
                         "genetics-breeding", "animal-welfare", "biosecurity"},
    "enterprise": _OPEN_CATS | {"nutrition-feed", "health-disease", "market-sales", "housing-equipment",
                                "genetics-breeding", "animal-welfare", "biosecurity"},
}

PLAN_CHAT_ACCESS = {
    "suspended": {"general", "suggestions"},
    "hobby": {"general", "suggestions", "newcomers"},
    "starter": {"general", "suggestions", "newcomers", "technical-help"},
    "pro": {"general", "suggestions", "newcomers", "technical-help", "market-watch"},
    "enterprise": {"general", "suggestions", "newcomers", "technical-help", "market-watch"},
}


def _get_allowed_categories(plan: str) -> set[str]:
    return PLAN_FORUM_ACCESS.get(plan, PLAN_FORUM_ACCESS["suspended"])


def _get_allowed_rooms(plan: str) -> set[str]:
    return PLAN_CHAT_ACCESS.get(plan, PLAN_CHAT_ACCESS["suspended"])


def _can_write(plan: str) -> bool:
    """Suspended users can only read."""
    return plan != "suspended"


def _moderate_content(content: str) -> tuple[ModerationAction, str | None]:
    """Basic content moderation. Returns (action, reason)."""
    lower = content.lower()
    for pattern in _BLOCKED_PATTERNS:
        if pattern in lower:
            return ModerationAction.flagged, f"Flagged: matched '{pattern}'"
    if len(content) < 3:
        return ModerationAction.flagged, "Content too short"
    return ModerationAction.approved, None


def _extract_ai_tags(title: str, content: str) -> str | None:
    """Extract topic tags from content. Basic keyword matching."""
    tags = []
    combined = (title + " " + content).lower()
    tag_keywords = {
        "nutrition": ["feed", "nutrition", "protein", "calcium", "diet", "nutricion", "alimento"],
        "health": ["disease", "vaccine", "mortality", "sick", "enfermedad", "vacuna", "mortalidad"],
        "genetics": ["breed", "genetics", "strain", "raza", "genetica", "linea"],
        "welfare": ["welfare", "stress", "behavior", "bienestar", "estres", "comportamiento"],
        "market": ["price", "market", "sell", "buyer", "precio", "mercado", "venta"],
        "eggs": ["egg", "production", "laying", "huevo", "produccion", "postura"],
        "housing": ["housing", "ventilation", "lighting", "galpon", "ventilacion", "iluminacion"],
        "biosecurity": ["biosecurity", "disinfect", "quarantine", "bioseguridad", "desinfeccion"],
        # FarmLogU sector demand signals
        "pork": ["pig", "swine", "pork", "cerdo", "porcino", "chancho", "lechon"],
        "cattle": ["cow", "cattle", "beef", "dairy", "bovino", "vaca", "ganado", "lecheria"],
        "crops": ["crop", "harvest", "irrigation", "soil", "cultivo", "cosecha", "riego", "suelo"],
        "suggestion": ["suggest", "idea", "feature", "request", "sugerencia", "idea", "solicitud"],
    }
    for tag, keywords in tag_keywords.items():
        if any(kw in combined for kw in keywords):
            tags.append(tag)
    return ",".join(tags[:5]) if tags else None


# ── Forum Categories ──────────────────────────────────────────────

@router.get("/categories", response_model=list[ForumCategoryRead])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    allowed = _get_allowed_categories(plan)
    result = await db.execute(
        select(ForumCategory)
        .where(ForumCategory.is_active.is_(True))
        .order_by(ForumCategory.sort_order)
    )
    cats = result.scalars().all()
    allowed = _get_allowed_categories(plan)
    out = []
    for c in cats:
        cr = ForumCategoryRead.model_validate(c)
        cr.locked = c.slug not in allowed
        out.append(cr)
    return out


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
    q = select(ForumThread, User.full_name).join(
        User, ForumThread.author_id == User.id
    )
    if category_id:
        q = q.where(ForumThread.category_id == category_id)
    if search:
        q = q.where(ForumThread.title.ilike(f"%{search}%"))

    q = q.order_by(
        ForumThread.is_pinned.desc(),
        ForumThread.last_activity_at.desc(),
    ).offset((page - 1) * size).limit(size)

    result = await db.execute(q)
    rows = result.all()
    threads = []
    for thread, author_name in rows:
        t = ForumThreadRead.model_validate(thread)
        t.author_name = author_name
        threads.append(t)
    return threads


@router.get("/threads/{thread_id}", response_model=ForumThreadDetail)
async def get_thread(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ForumThread, User.full_name).join(
            User, ForumThread.author_id == User.id
        ).where(ForumThread.id == thread_id)
    )
    row = result.one_or_none()
    if not row:
        raise NotFoundError("Thread not found")

    thread, author_name = row

    # Increment view count
    await db.execute(
        update(ForumThread)
        .where(ForumThread.id == thread_id)
        .values(view_count=ForumThread.view_count + 1)
    )
    await db.flush()

    # Get posts
    posts_result = await db.execute(
        select(ForumPost, User.full_name).join(
            User, ForumPost.author_id == User.id
        ).where(
            ForumPost.thread_id == thread_id,
            ForumPost.moderation_status != ModerationAction.removed,
        ).order_by(ForumPost.created_at)
    )
    posts = []
    for post, post_author_name in posts_result.all():
        p = ForumPostRead.model_validate(post)
        p.author_name = post_author_name
        posts.append(p)

    detail = ForumThreadDetail.model_validate(thread)
    detail.author_name = author_name
    detail.posts = posts
    return detail


@router.post("/threads", response_model=ForumThreadRead, status_code=201)
async def create_thread(
    data: ForumThreadCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    if not _can_write(plan):
        raise ForbiddenError("Upgrade your plan to post in the forum.")
    # Verify category exists
    cat = await db.get(ForumCategory, data.category_id)
    if not cat or not cat.is_active:
        raise NotFoundError("Category not found")
    # Check plan access to this category
    allowed = _get_allowed_categories(plan)
    if cat.slug not in allowed:
        raise ForbiddenError(f"Upgrade your plan to post in '{cat.name}'. Current plan: {plan}.")

    # Create thread
    thread = ForumThread(
        id=uuid.uuid4(),
        category_id=data.category_id,
        author_id=user.id,
        title=data.title,
        ai_tags=_extract_ai_tags(data.title, data.content),
    )
    db.add(thread)
    await db.flush()

    # Create first post (thread body)
    mod_action, mod_reason = _moderate_content(data.content)
    post = ForumPost(
        id=uuid.uuid4(),
        thread_id=thread.id,
        author_id=user.id,
        content=data.content,
        moderation_status=mod_action,
        moderation_reason=mod_reason,
    )
    db.add(post)
    await db.commit()
    await db.refresh(thread)

    result = ForumThreadRead.model_validate(thread)
    result.author_name = user.full_name
    return result


# ── Forum Posts ───────────────────────────────────────────────────

@router.post("/posts", response_model=ForumPostRead, status_code=201)
async def create_post(
    data: ForumPostCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    if not _can_write(plan):
        raise ForbiddenError("Upgrade your plan to post in the forum.")
    # Verify thread exists and not locked
    thread = await db.get(ForumThread, data.thread_id)
    if not thread:
        raise NotFoundError("Thread not found")
    # Check plan access to thread's category
    cat = await db.get(ForumCategory, thread.category_id)
    if cat:
        allowed = _get_allowed_categories(plan)
        if cat.slug not in allowed:
            raise ForbiddenError(f"Upgrade your plan to reply in '{cat.name}'.")
    if thread.is_locked:
        raise ForbiddenError("This thread is locked")

    mod_action, mod_reason = _moderate_content(data.content)
    post = ForumPost(
        id=uuid.uuid4(),
        thread_id=data.thread_id,
        author_id=user.id,
        parent_id=data.parent_id,
        content=data.content,
        moderation_status=mod_action,
        moderation_reason=mod_reason,
    )
    db.add(post)

    # Update thread reply count and last activity
    thread.reply_count += 1
    thread.last_activity_at = datetime.now(timezone.utc)
    # Update AI tags with new content
    new_tags = _extract_ai_tags(thread.title, data.content)
    if new_tags and thread.ai_tags:
        existing = set(thread.ai_tags.split(","))
        existing.update(new_tags.split(","))
        thread.ai_tags = ",".join(sorted(existing)[:8])
    elif new_tags:
        thread.ai_tags = new_tags

    await db.commit()
    await db.refresh(post)

    result = ForumPostRead.model_validate(post)
    result.author_name = user.full_name
    return result


@router.put("/posts/{post_id}", response_model=ForumPostRead)
async def update_post(
    post_id: uuid.UUID,
    data: ForumPostUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = await db.get(ForumPost, post_id)
    if not post:
        raise NotFoundError("Post not found")
    if post.author_id != user.id:
        raise ForbiddenError("You can only edit your own posts")

    mod_action, mod_reason = _moderate_content(data.content)
    post.content = data.content
    post.moderation_status = mod_action
    post.moderation_reason = mod_reason
    await db.commit()
    await db.refresh(post)

    result = ForumPostRead.model_validate(post)
    result.author_name = user.full_name
    return result


@router.post("/posts/{post_id}/like", status_code=200)
async def toggle_like(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    post = await db.get(ForumPost, post_id)
    if not post:
        raise NotFoundError("Post not found")

    # Check if already liked
    existing = await db.execute(
        select(PostLike).where(
            PostLike.post_id == post_id,
            PostLike.user_id == user.id,
        )
    )
    like = existing.scalar_one_or_none()

    if like:
        await db.delete(like)
        post.likes_count = max(0, post.likes_count - 1)
        action = "unliked"
    else:
        db.add(PostLike(id=uuid.uuid4(), post_id=post_id, user_id=user.id))
        post.likes_count += 1
        action = "liked"

    await db.commit()
    return {"action": action, "likes_count": post.likes_count}


# ── Chat Rooms ────────────────────────────────────────────────────

@router.get("/rooms", response_model=list[ChatRoomRead])
async def list_rooms(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    result = await db.execute(
        select(ChatRoom).where(ChatRoom.is_active.is_(True)).order_by(ChatRoom.name)
    )
    allowed = _get_allowed_rooms(plan)
    rooms = []
    for room in result.scalars().all():
        r = ChatRoomRead.model_validate(room)
        r.locked = room.slug not in allowed
        rooms.append(r)
    return rooms


@router.get("/rooms/{room_id}/messages", response_model=list[ChatMessageRead])
async def list_messages(
    room_id: uuid.UUID,
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (
        select(ChatMessage, User.full_name)
        .join(User, ChatMessage.author_id == User.id)
        .where(
            ChatMessage.room_id == room_id,
            ChatMessage.moderation_status != ModerationAction.removed,
        )
    )
    if before:
        q = q.where(ChatMessage.created_at < before)
    q = q.order_by(ChatMessage.created_at.desc()).limit(limit)

    result = await db.execute(q)
    messages = []
    for msg, author_name in reversed(result.all()):
        m = ChatMessageRead.model_validate(msg)
        m.author_name = author_name
        messages.append(m)
    return messages


@router.post("/rooms/{room_id}/messages", response_model=ChatMessageRead, status_code=201)
async def send_message(
    room_id: uuid.UUID,
    data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
):
    if not _can_write(plan):
        raise ForbiddenError("Upgrade your plan to chat.")
    room = await db.get(ChatRoom, room_id)
    if not room or not room.is_active:
        raise NotFoundError("Chat room not found")
    # Check plan access to this room
    allowed_rooms = _get_allowed_rooms(plan)
    if room.slug not in allowed_rooms:
        raise ForbiddenError(f"Upgrade your plan to access '{room.name}'.")

    mod_action, mod_reason = _moderate_content(data.content)
    msg = ChatMessage(
        id=uuid.uuid4(),
        room_id=room_id,
        author_id=user.id,
        content=data.content,
        moderation_status=mod_action,
        moderation_reason=mod_reason,
        author_country=getattr(user, "country", None),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Publish to Redis for WebSocket subscribers
    try:
        from src.core.rate_limit import _redis
        if _redis:
            import json
            await _redis.publish(f"chat:{room_id}", json.dumps({
                "type": "chat_message",
                "room_id": str(room_id),
                "message": {
                    "id": str(msg.id),
                    "author_name": user.full_name,
                    "content": msg.content if mod_action == ModerationAction.approved else "[Message under review]",
                    "is_ai": False,
                    "created_at": msg.created_at.isoformat(),
                },
            }))
    except Exception as e:
        logger.warning("Failed to publish chat message: %s", e)

    result = ChatMessageRead.model_validate(msg)
    result.author_name = user.full_name
    return result


# ── AI Insights (superadmin / internal) ───────────────────────────

@router.get("/insights", response_model=list[AIInsightRead])
async def list_insights(
    insight_type: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(AIInsight).order_by(AIInsight.relevance_score.desc())
    if insight_type:
        q = q.where(AIInsight.insight_type == insight_type)
    q = q.limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


# ── Community Stats ───────────────────────────────────────────────

@router.get("/stats", response_model=CommunityStats)
async def community_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)

    threads_count = await db.scalar(select(func.count(ForumThread.id)))
    posts_count = await db.scalar(select(func.count(ForumPost.id)))
    messages_count = await db.scalar(select(func.count(ChatMessage.id)))

    # Active users in last 24h (union of forum + chat authors)
    forum_authors = select(ForumPost.author_id).where(ForumPost.created_at >= day_ago)
    chat_authors = select(ChatMessage.author_id).where(ChatMessage.created_at >= day_ago)
    union_q = forum_authors.union(chat_authors).subquery()
    active_users = await db.scalar(select(func.count()).select_from(union_q))

    # Top categories by thread count
    top_cats_q = (
        select(ForumCategory.name, func.count(ForumThread.id).label("cnt"))
        .join(ForumThread, ForumThread.category_id == ForumCategory.id)
        .group_by(ForumCategory.name)
        .order_by(func.count(ForumThread.id).desc())
        .limit(5)
    )
    top_cats_result = await db.execute(top_cats_q)
    top_categories = [{"name": name, "threads": cnt} for name, cnt in top_cats_result.all()]

    insights_count = await db.scalar(select(func.count(AIInsight.id)))

    # Distinct countries from chat messages
    countries = await db.scalar(
        select(func.count(func.distinct(ChatMessage.author_country)))
        .where(ChatMessage.author_country.isnot(None))
    )

    return CommunityStats(
        total_threads=threads_count or 0,
        total_posts=posts_count or 0,
        total_chat_messages=messages_count or 0,
        active_users_24h=active_users or 0,
        top_categories=top_categories,
        ai_insights_count=insights_count or 0,
        countries_active=countries or 0,
    )
