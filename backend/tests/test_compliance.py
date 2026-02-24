import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_list_certifications_empty(client: AsyncClient, authenticated_user):
    resp = await client.get(
        "/api/v1/compliance/certifications",
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_create_certification(client: AsyncClient, authenticated_user):
    resp = await client.post(
        "/api/v1/compliance/certifications",
        headers=authenticated_user["headers"],
        json={
            "framework": "senasica",
            "name": "Certificado BPP Avicola",
            "certificate_number": "SENASICA-2026-001",
            "issued_date": "2026-01-15",
            "expiry_date": "2027-01-15",
            "issuing_authority": "SENASICA Mexico",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["framework"] == "senasica"
    assert data["status"] == "active"


async def test_create_salmonella_test(client: AsyncClient, authenticated_user, sample_flock):
    resp = await client.post(
        "/api/v1/compliance/salmonella",
        headers=authenticated_user["headers"],
        json={
            "flock_id": str(sample_flock.id),
            "sample_date": "2026-02-20",
            "lab_name": "LabAvicola Central",
            "sample_type": "environment",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["result"] == "pending"


async def test_create_inspection(client: AsyncClient, authenticated_user):
    resp = await client.post(
        "/api/v1/compliance/inspections",
        headers=authenticated_user["headers"],
        json={
            "framework": "haccp",
            "inspection_type": "Annual HACCP Audit",
            "scheduled_date": "2026-03-15",
            "inspector_name": "Dr. Rodriguez",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "scheduled"
