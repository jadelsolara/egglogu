"""CommunityService — Forum threads, posts, chat rooms, AI insights, stats."""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update

from src.core.exceptions import ForbiddenError, NotFoundError
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
    ChatMessageRead,
    ChatRoomRead,
    CommunityStats,
    ForumCategoryRead,
    ForumPostRead,
    ForumThreadDetail,
    ForumThreadRead,
)
from src.services.base import BaseService

logger = logging.getLogger("egglogu.community")

# ── Constants ─────────────────────────────────────────────────────

_BLOCKED_PATTERNS = [
    "spam",
    "scam",
    "buy now",
    "click here",
    "free money",
]

_OPEN_CATS = {
    "general",
    "suggestions",
    "pork-production",
    "cattle-production",
    "crop-agriculture",
}

PLAN_FORUM_ACCESS = {
    "suspended": _OPEN_CATS,
    "hobby": _OPEN_CATS | {"nutrition-feed"},
    "starter": _OPEN_CATS
    | {"nutrition-feed", "health-disease", "market-sales", "housing-equipment"},
    "pro": _OPEN_CATS
    | {
        "nutrition-feed",
        "health-disease",
        "market-sales",
        "housing-equipment",
        "genetics-breeding",
        "animal-welfare",
        "biosecurity",
    },
    "enterprise": _OPEN_CATS
    | {
        "nutrition-feed",
        "health-disease",
        "market-sales",
        "housing-equipment",
        "genetics-breeding",
        "animal-welfare",
        "biosecurity",
    },
}

PLAN_CHAT_ACCESS = {
    "suspended": {"general", "suggestions"},
    "hobby": {"general", "suggestions", "newcomers"},
    "starter": {"general", "suggestions", "newcomers", "technical-help"},
    "pro": {"general", "suggestions", "newcomers", "technical-help", "market-watch"},
    "enterprise": {
        "general",
        "suggestions",
        "newcomers",
        "technical-help",
        "market-watch",
    },
}


# ── Pure helpers (no DB) ──────────────────────────────────────────


def _get_allowed_categories(plan: str) -> set[str]:
    return PLAN_FORUM_ACCESS.get(plan, PLAN_FORUM_ACCESS["suspended"])


def _get_allowed_rooms(plan: str) -> set[str]:
    return PLAN_CHAT_ACCESS.get(plan, PLAN_CHAT_ACCESS["suspended"])


def _can_write(plan: str) -> bool:
    return plan != "suspended"


def _moderate_content(content: str) -> tuple[ModerationAction, str | None]:
    lower = content.lower()
    for pattern in _BLOCKED_PATTERNS:
        if pattern in lower:
            return ModerationAction.flagged, f"Flagged: matched '{pattern}'"
    if len(content) < 3:
        return ModerationAction.flagged, "Content too short"
    return ModerationAction.approved, None


def _extract_ai_tags(title: str, content: str) -> str | None:
    tags = []
    combined = (title + " " + content).lower()
    tag_keywords = {
        "nutrition": [
            "feed",
            "nutrition",
            "protein",
            "calcium",
            "diet",
            "nutricion",
            "alimento",
        ],
        "health": [
            "disease",
            "vaccine",
            "mortality",
            "sick",
            "enfermedad",
            "vacuna",
            "mortalidad",
        ],
        "genetics": ["breed", "genetics", "strain", "raza", "genetica", "linea"],
        "welfare": [
            "welfare",
            "stress",
            "behavior",
            "bienestar",
            "estres",
            "comportamiento",
        ],
        "market": ["price", "market", "sell", "buyer", "precio", "mercado", "venta"],
        "eggs": ["egg", "production", "laying", "huevo", "produccion", "postura"],
        "housing": [
            "housing",
            "ventilation",
            "lighting",
            "galpon",
            "ventilacion",
            "iluminacion",
        ],
        "biosecurity": [
            "biosecurity",
            "disinfect",
            "quarantine",
            "bioseguridad",
            "desinfeccion",
        ],
        "pork": ["pig", "swine", "pork", "cerdo", "porcino", "chancho", "lechon"],
        "cattle": [
            "cow",
            "cattle",
            "beef",
            "dairy",
            "bovino",
            "vaca",
            "ganado",
            "lecheria",
        ],
        "crops": [
            "crop",
            "harvest",
            "irrigation",
            "soil",
            "cultivo",
            "cosecha",
            "riego",
            "suelo",
        ],
        "suggestion": [
            "suggest",
            "idea",
            "feature",
            "request",
            "sugerencia",
            "idea",
            "solicitud",
        ],
    }
    for tag, keywords in tag_keywords.items():
        if any(kw in combined for kw in keywords):
            tags.append(tag)
    return ",".join(tags[:5]) if tags else None


class CommunityService(BaseService):
    # ── Forum Categories ──────────────────────────────────────────

    async def list_categories(self, plan: str) -> list[ForumCategoryRead]:
        result = await self.db.execute(
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

    # ── Forum Threads ─────────────────────────────────────────────

    async def list_threads(
        self,
        plan: str,
        category_id: uuid.UUID | None = None,
        search: str | None = None,
        page: int = 1,
        size: int = 20,
    ) -> list[ForumThreadRead]:
        q = select(ForumThread, User.full_name).join(
            User, ForumThread.author_id == User.id
        )
        if category_id:
            q = q.where(ForumThread.category_id == category_id)
        if search:
            q = q.where(ForumThread.title.ilike(f"%{search}%"))

        q = (
            q.order_by(
                ForumThread.is_pinned.desc(),
                ForumThread.last_activity_at.desc(),
            )
            .offset((page - 1) * size)
            .limit(size)
        )

        result = await self.db.execute(q)
        rows = result.all()
        threads = []
        for thread, author_name in rows:
            t = ForumThreadRead.model_validate(thread)
            t.author_name = author_name
            threads.append(t)
        return threads

    async def get_thread(self, thread_id: uuid.UUID) -> ForumThreadDetail:
        result = await self.db.execute(
            select(ForumThread, User.full_name)
            .join(User, ForumThread.author_id == User.id)
            .where(ForumThread.id == thread_id)
        )
        row = result.one_or_none()
        if not row:
            raise NotFoundError("Thread not found")

        thread, author_name = row

        await self.db.execute(
            update(ForumThread)
            .where(ForumThread.id == thread_id)
            .values(view_count=ForumThread.view_count + 1)
        )
        await self.db.flush()

        posts_result = await self.db.execute(
            select(ForumPost, User.full_name)
            .join(User, ForumPost.author_id == User.id)
            .where(
                ForumPost.thread_id == thread_id,
                ForumPost.moderation_status != ModerationAction.removed,
            )
            .order_by(ForumPost.created_at)
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

    async def create_thread(
        self,
        category_id: uuid.UUID,
        title: str,
        content: str,
        plan: str,
        user_full_name: str,
    ) -> ForumThreadRead:
        if not _can_write(plan):
            raise ForbiddenError("Upgrade your plan to post in the forum.")
        cat = await self.db.get(ForumCategory, category_id)
        if not cat or not cat.is_active:
            raise NotFoundError("Category not found")
        allowed = _get_allowed_categories(plan)
        if cat.slug not in allowed:
            raise ForbiddenError(
                f"Upgrade your plan to post in '{cat.name}'. Current plan: {plan}."
            )

        thread = ForumThread(
            id=uuid.uuid4(),
            category_id=category_id,
            author_id=self.user_id,
            title=title,
            ai_tags=_extract_ai_tags(title, content),
        )
        self.db.add(thread)
        await self.db.flush()

        mod_action, mod_reason = _moderate_content(content)
        post = ForumPost(
            id=uuid.uuid4(),
            thread_id=thread.id,
            author_id=self.user_id,
            content=content,
            moderation_status=mod_action,
            moderation_reason=mod_reason,
        )
        self.db.add(post)
        await self.db.commit()
        await self.db.refresh(thread)

        result = ForumThreadRead.model_validate(thread)
        result.author_name = user_full_name
        return result

    # ── Forum Posts ────────────────────────────────────────────────

    async def create_post(
        self,
        thread_id: uuid.UUID,
        content: str,
        plan: str,
        user_full_name: str,
        parent_id: uuid.UUID | None = None,
    ) -> ForumPostRead:
        if not _can_write(plan):
            raise ForbiddenError("Upgrade your plan to post in the forum.")
        thread = await self.db.get(ForumThread, thread_id)
        if not thread:
            raise NotFoundError("Thread not found")
        cat = await self.db.get(ForumCategory, thread.category_id)
        if cat:
            allowed = _get_allowed_categories(plan)
            if cat.slug not in allowed:
                raise ForbiddenError(f"Upgrade your plan to reply in '{cat.name}'.")
        if thread.is_locked:
            raise ForbiddenError("This thread is locked")

        mod_action, mod_reason = _moderate_content(content)
        post = ForumPost(
            id=uuid.uuid4(),
            thread_id=thread_id,
            author_id=self.user_id,
            parent_id=parent_id,
            content=content,
            moderation_status=mod_action,
            moderation_reason=mod_reason,
        )
        self.db.add(post)

        thread.reply_count += 1
        thread.last_activity_at = datetime.now(timezone.utc)
        new_tags = _extract_ai_tags(thread.title, content)
        if new_tags and thread.ai_tags:
            existing = set(thread.ai_tags.split(","))
            existing.update(new_tags.split(","))
            thread.ai_tags = ",".join(sorted(existing)[:8])
        elif new_tags:
            thread.ai_tags = new_tags

        await self.db.commit()
        await self.db.refresh(post)

        result = ForumPostRead.model_validate(post)
        result.author_name = user_full_name
        return result

    async def update_post(
        self, post_id: uuid.UUID, content: str, user_full_name: str
    ) -> ForumPostRead:
        post = await self.db.get(ForumPost, post_id)
        if not post:
            raise NotFoundError("Post not found")
        if post.author_id != self.user_id:
            raise ForbiddenError("You can only edit your own posts")

        mod_action, mod_reason = _moderate_content(content)
        post.content = content
        post.moderation_status = mod_action
        post.moderation_reason = mod_reason
        await self.db.commit()
        await self.db.refresh(post)

        result = ForumPostRead.model_validate(post)
        result.author_name = user_full_name
        return result

    async def toggle_like(self, post_id: uuid.UUID) -> dict:
        post = await self.db.get(ForumPost, post_id)
        if not post:
            raise NotFoundError("Post not found")

        existing = await self.db.execute(
            select(PostLike).where(
                PostLike.post_id == post_id,
                PostLike.user_id == self.user_id,
            )
        )
        like = existing.scalar_one_or_none()

        if like:
            await self.db.delete(like)
            post.likes_count = max(0, post.likes_count - 1)
            action = "unliked"
        else:
            self.db.add(
                PostLike(id=uuid.uuid4(), post_id=post_id, user_id=self.user_id)
            )
            post.likes_count += 1
            action = "liked"

        await self.db.commit()
        return {"action": action, "likes_count": post.likes_count}

    # ── Chat Rooms ────────────────────────────────────────────────

    async def list_rooms(self, plan: str) -> list[ChatRoomRead]:
        result = await self.db.execute(
            select(ChatRoom).where(ChatRoom.is_active.is_(True)).order_by(ChatRoom.name)
        )
        allowed = _get_allowed_rooms(plan)
        rooms = []
        for room in result.scalars().all():
            r = ChatRoomRead.model_validate(room)
            r.locked = room.slug not in allowed
            rooms.append(r)
        return rooms

    async def list_messages(
        self,
        room_id: uuid.UUID,
        before: datetime | None = None,
        limit: int = 50,
    ) -> list[ChatMessageRead]:
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

        result = await self.db.execute(q)
        messages = []
        for msg, author_name in reversed(result.all()):
            m = ChatMessageRead.model_validate(msg)
            m.author_name = author_name
            messages.append(m)
        return messages

    async def send_message(
        self,
        room_id: uuid.UUID,
        content: str,
        plan: str,
        user_full_name: str,
        user_country: str | None = None,
    ) -> ChatMessageRead:
        if not _can_write(plan):
            raise ForbiddenError("Upgrade your plan to chat.")
        room = await self.db.get(ChatRoom, room_id)
        if not room or not room.is_active:
            raise NotFoundError("Chat room not found")
        allowed_rooms = _get_allowed_rooms(plan)
        if room.slug not in allowed_rooms:
            raise ForbiddenError(f"Upgrade your plan to access '{room.name}'.")

        mod_action, mod_reason = _moderate_content(content)
        msg = ChatMessage(
            id=uuid.uuid4(),
            room_id=room_id,
            author_id=self.user_id,
            content=content,
            moderation_status=mod_action,
            moderation_reason=mod_reason,
            author_country=user_country,
        )
        self.db.add(msg)
        await self.db.commit()
        await self.db.refresh(msg)

        # Publish to Redis for WebSocket subscribers
        try:
            from src.core.rate_limit import _redis

            if _redis:
                import json

                await _redis.publish(
                    f"chat:{room_id}",
                    json.dumps(
                        {
                            "type": "chat_message",
                            "room_id": str(room_id),
                            "message": {
                                "id": str(msg.id),
                                "author_name": user_full_name,
                                "content": msg.content
                                if mod_action == ModerationAction.approved
                                else "[Message under review]",
                                "is_ai": False,
                                "created_at": msg.created_at.isoformat(),
                            },
                        }
                    ),
                )
        except Exception as e:
            logger.warning("Failed to publish chat message: %s", e)

        result = ChatMessageRead.model_validate(msg)
        result.author_name = user_full_name
        return result

    # ── AI Insights ───────────────────────────────────────────────

    async def list_insights(
        self, insight_type: str | None = None, limit: int = 20
    ) -> list:
        q = select(AIInsight).order_by(AIInsight.relevance_score.desc())
        if insight_type:
            q = q.where(AIInsight.insight_type == insight_type)
        q = q.limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    # ── Community Stats ───────────────────────────────────────────

    async def community_stats(self) -> CommunityStats:
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(hours=24)

        threads_count = await self.db.scalar(select(func.count(ForumThread.id)))
        posts_count = await self.db.scalar(select(func.count(ForumPost.id)))
        messages_count = await self.db.scalar(select(func.count(ChatMessage.id)))

        forum_authors = select(ForumPost.author_id).where(
            ForumPost.created_at >= day_ago
        )
        chat_authors = select(ChatMessage.author_id).where(
            ChatMessage.created_at >= day_ago
        )
        union_q = forum_authors.union(chat_authors).subquery()
        active_users = await self.db.scalar(select(func.count()).select_from(union_q))

        top_cats_q = (
            select(ForumCategory.name, func.count(ForumThread.id).label("cnt"))
            .join(ForumThread, ForumThread.category_id == ForumCategory.id)
            .group_by(ForumCategory.name)
            .order_by(func.count(ForumThread.id).desc())
            .limit(5)
        )
        top_cats_result = await self.db.execute(top_cats_q)
        top_categories = [
            {"name": name, "threads": cnt} for name, cnt in top_cats_result.all()
        ]

        insights_count = await self.db.scalar(select(func.count(AIInsight.id)))

        countries = await self.db.scalar(
            select(func.count(func.distinct(ChatMessage.author_country))).where(
                ChatMessage.author_country.isnot(None)
            )
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
