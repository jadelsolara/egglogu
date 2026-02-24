import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_list_grading_sessions_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/grading/sessions",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_grading_session(client: AsyncClient, authenticated_user, sample_flock):
    resp = await client.post(
        "/api/v1/grading/sessions",
        headers=authenticated_user["headers"],
        json={
            "flock_id": str(sample_flock.id),
            "date": "2026-02-24",
            "total_graded": 1000,
            "grade_aa": 700,
            "grade_a": 200,
            "grade_b": 80,
            "rejected": 20,
            "haugh_unit": 85.0,
            "yolk_color_score": 8,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["total_graded"] == 1000
    assert data["grade_aa"] == 700
    assert data["haugh_unit"] == 85.0
