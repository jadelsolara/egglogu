"""Tests for /api/v1/community endpoints (forum + chat)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.community import ForumCategory, ChatRoom


PREFIX = "/api/v1/community"


# ── Helpers ──

async def _seed_category(db: AsyncSession, slug="general", name="General Discussion") -> ForumCategory:
    cat = ForumCategory(
        id=uuid.uuid4(), name=name, slug=slug,
        description="Test category", icon="💬", sort_order=1, is_active=True,
    )
    db.add(cat)
    await db.flush()
    return cat


async def _seed_room(db: AsyncSession, slug="general", name="General Chat") -> ChatRoom:
    room = ChatRoom(
        id=uuid.uuid4(), name=name, slug=slug,
        description="Test room", icon="💬", is_active=True,
    )
    db.add(room)
    await db.flush()
    return room


# ── Forum Categories ──

@pytest.mark.asyncio
class TestListCategories:
    async def test_list_categories(self, client: AsyncClient, authenticated_user, db_session):
        await _seed_category(db_session)
        resp = await client.get(f"{PREFIX}/categories", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        cats = resp.json()
        assert isinstance(cats, list)
        assert len(cats) >= 1
        assert cats[0]["slug"] == "general"

    async def test_list_categories_unauth(self, client: AsyncClient):
        resp = await client.get(f"{PREFIX}/categories")
        assert resp.status_code in (401, 403)


# ── Forum Threads ──

@pytest.mark.asyncio
class TestForumThreads:
    async def test_create_thread(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        resp = await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "My first thread topic", "content": "This is the body of my thread with enough content"},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "My first thread topic"
        assert data["category_id"] == str(cat.id)
        return data

    async def test_list_threads(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "Thread for listing test", "content": "This is a test thread body content"},
            headers=authenticated_user["headers"],
        )
        resp = await client.get(f"{PREFIX}/threads", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_list_threads_filter_category(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "Filtered thread test topic", "content": "Content for filtering test thread"},
            headers=authenticated_user["headers"],
        )
        resp = await client.get(
            f"{PREFIX}/threads", params={"category_id": str(cat.id)},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 200
        for t in resp.json():
            assert t["category_id"] == str(cat.id)

    async def test_get_thread_detail(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        create_resp = await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "Thread detail view test", "content": "Body of the detailed thread view test"},
            headers=authenticated_user["headers"],
        )
        thread_id = create_resp.json()["id"]
        resp = await client.get(f"{PREFIX}/threads/{thread_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["id"] == thread_id
        assert "posts" in resp.json()

    async def test_get_thread_not_found(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.get(f"{PREFIX}/threads/{fake_id}", headers=authenticated_user["headers"])
        assert resp.status_code == 404

    async def test_create_thread_invalid_category(self, client: AsyncClient, authenticated_user):
        resp = await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(uuid.uuid4()), "title": "Thread with bad category", "content": "Body for invalid category test"},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 404


# ── Forum Posts ──

@pytest.mark.asyncio
class TestForumPosts:
    async def test_create_reply(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        thread = await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "Thread to reply to here", "content": "Original thread body content here"},
            headers=authenticated_user["headers"],
        )
        thread_id = thread.json()["id"]
        resp = await client.post(
            f"{PREFIX}/posts",
            json={"thread_id": thread_id, "content": "This is a reply to the thread"},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 201
        assert resp.json()["thread_id"] == thread_id

    async def test_update_own_post(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        thread = await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "Thread for post edit test", "content": "Original thread content for editing"},
            headers=authenticated_user["headers"],
        )
        thread_id = thread.json()["id"]
        post_resp = await client.post(
            f"{PREFIX}/posts",
            json={"thread_id": thread_id, "content": "Original post content to edit"},
            headers=authenticated_user["headers"],
        )
        post_id = post_resp.json()["id"]
        update_resp = await client.put(
            f"{PREFIX}/posts/{post_id}",
            json={"content": "Updated post content after editing"},
            headers=authenticated_user["headers"],
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["content"] == "Updated post content after editing"

    async def test_toggle_like(self, client: AsyncClient, authenticated_user, db_session):
        cat = await _seed_category(db_session)
        thread = await client.post(
            f"{PREFIX}/threads",
            json={"category_id": str(cat.id), "title": "Thread for like toggle test", "content": "Content of thread to test likes"},
            headers=authenticated_user["headers"],
        )
        thread_id = thread.json()["id"]
        post_resp = await client.post(
            f"{PREFIX}/posts",
            json={"thread_id": thread_id, "content": "Post to like and unlike"},
            headers=authenticated_user["headers"],
        )
        post_id = post_resp.json()["id"]

        # Like
        like_resp = await client.post(f"{PREFIX}/posts/{post_id}/like", headers=authenticated_user["headers"])
        assert like_resp.status_code == 200
        assert like_resp.json()["action"] == "liked"
        assert like_resp.json()["likes_count"] == 1

        # Unlike
        unlike_resp = await client.post(f"{PREFIX}/posts/{post_id}/like", headers=authenticated_user["headers"])
        assert unlike_resp.status_code == 200
        assert unlike_resp.json()["action"] == "unliked"
        assert unlike_resp.json()["likes_count"] == 0


# ── Chat Rooms ──

@pytest.mark.asyncio
class TestChatRooms:
    async def test_list_rooms(self, client: AsyncClient, authenticated_user, db_session):
        await _seed_room(db_session)
        resp = await client.get(f"{PREFIX}/rooms", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        rooms = resp.json()
        assert isinstance(rooms, list)
        assert len(rooms) >= 1


# ── Chat Messages ──

@pytest.mark.asyncio
class TestChatMessages:
    async def test_send_and_list_messages(self, client: AsyncClient, authenticated_user, db_session):
        room = await _seed_room(db_session)
        send_resp = await client.post(
            f"{PREFIX}/rooms/{room.id}/messages",
            json={"room_id": str(room.id), "content": "Hello from the test!"},
            headers=authenticated_user["headers"],
        )
        assert send_resp.status_code == 201
        msg = send_resp.json()
        assert msg["content"] == "Hello from the test!"

        list_resp = await client.get(
            f"{PREFIX}/rooms/{room.id}/messages",
            headers=authenticated_user["headers"],
        )
        assert list_resp.status_code == 200
        assert len(list_resp.json()) >= 1

    async def test_send_message_invalid_room(self, client: AsyncClient, authenticated_user):
        fake_id = str(uuid.uuid4())
        resp = await client.post(
            f"{PREFIX}/rooms/{fake_id}/messages",
            json={"room_id": fake_id, "content": "Should fail"},
            headers=authenticated_user["headers"],
        )
        assert resp.status_code == 404


# ── Community Stats ──

@pytest.mark.asyncio
class TestCommunityStats:
    async def test_get_stats(self, client: AsyncClient, authenticated_user):
        resp = await client.get(f"{PREFIX}/stats", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        data = resp.json()
        assert "total_threads" in data
        assert "total_posts" in data
        assert "total_chat_messages" in data


# ── AI Insights ──

@pytest.mark.asyncio
class TestAIInsights:
    async def test_list_insights_empty(self, client: AsyncClient, authenticated_user):
        resp = await client.get(f"{PREFIX}/insights", headers=authenticated_user["headers"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
