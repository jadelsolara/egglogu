import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_org_plan, require_role
from src.database import get_db
from src.models.auth import User
from src.schemas.support import (
    AdminAnalytics,
    AdminReply,
    AdminTicketUpdate,
    AutoResponseCreate,
    AutoResponseRead,
    AutoResponseUpdate,
    FAQCreate,
    FAQRead,
    FAQUpdate,
    HelpfulFeedback,
    MessageRead,
    RatingRead,
    TicketCreate,
    TicketDetailRead,
    TicketMessageCreate,
    TicketRatingCreate,
    TicketRead,
    TicketSyncRequest,
    TicketSyncResponse,
)
from src.services.support_service import SupportService

router = APIRouter(prefix="/support", tags=["support"])


def _svc(db: AsyncSession, user: User) -> SupportService:
    return SupportService(db, user.organization_id, user.id)


# ══════════════════════════════════════════════
# PUBLIC — FAQ
# ══════════════════════════════════════════════


@router.get("/faq", response_model=list[FAQRead])
async def list_faq(
    q: str = Query("", max_length=200),
    category: str = Query("", max_length=30),
    db: AsyncSession = Depends(get_db),
):
    svc = SupportService(db, uuid.UUID(int=0), uuid.UUID(int=0))
    return await svc.list_faq(q=q, category=category)


@router.post("/faq/{faq_id}/helpful")
async def faq_helpful(
    faq_id: uuid.UUID, data: HelpfulFeedback, db: AsyncSession = Depends(get_db)
):
    svc = SupportService(db, uuid.UUID(int=0), uuid.UUID(int=0))
    return await svc.faq_helpful(faq_id, data.helpful)


# ══════════════════════════════════════════════
# USER — Tickets
# ══════════════════════════════════════════════


@router.get("/tickets", response_model=list[TicketRead])
async def list_user_tickets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.list_user_tickets()


@router.post("/tickets", response_model=TicketRead, status_code=201)
async def create_ticket(
    data: TicketCreate,
    request: Request,
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.create_ticket(
        subject=data.subject,
        description=data.description,
        priority_str=data.priority,
        plan=plan,
        user_email=user.email,
        accept_language=request.headers.get("accept-language", ""),
    )


@router.get("/tickets/{ticket_id}", response_model=TicketDetailRead)
async def get_ticket(
    ticket_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.get_ticket(ticket_id)


@router.post(
    "/tickets/{ticket_id}/messages", response_model=MessageRead, status_code=201
)
async def add_message(
    ticket_id: uuid.UUID,
    data: TicketMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.add_message(ticket_id, data.message, user.email)


@router.post("/tickets/{ticket_id}/close")
async def close_ticket(
    ticket_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.close_ticket(ticket_id)


@router.post("/tickets/{ticket_id}/rate", response_model=RatingRead, status_code=201)
async def rate_ticket(
    ticket_id: uuid.UUID,
    data: TicketRatingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.rate_ticket(ticket_id, data.rating, data.comment)


@router.post("/tickets/sync", response_model=TicketSyncResponse)
async def sync_offline_tickets(
    data: TicketSyncRequest,
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    result = await svc.sync_offline_tickets(data.tickets, plan, user.email)
    return TicketSyncResponse(**result)


# ══════════════════════════════════════════════
# ADMIN — Contact Center
# ══════════════════════════════════════════════


@router.get("/admin/tickets", response_model=list[TicketRead])
async def admin_list_tickets(
    status: str = Query("", max_length=20),
    category: str = Query("", max_length=30),
    priority: str = Query("", max_length=10),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.admin_list_tickets(status, category, priority, page, size)


@router.put("/admin/tickets/{ticket_id}", response_model=TicketRead)
async def admin_update_ticket(
    ticket_id: uuid.UUID,
    data: AdminTicketUpdate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.admin_update_ticket(ticket_id, data)


@router.post(
    "/admin/tickets/{ticket_id}/reply", response_model=MessageRead, status_code=201
)
async def admin_reply(
    ticket_id: uuid.UUID,
    data: AdminReply,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.admin_reply(ticket_id, data.message, data.is_internal, user.email)


@router.get("/admin/analytics", response_model=AdminAnalytics)
async def admin_analytics(
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.admin_analytics()


# ── Admin FAQ CRUD ──


@router.post("/admin/faq", response_model=FAQRead, status_code=201)
async def create_faq(
    data: FAQCreate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.create_faq(data)


@router.put("/admin/faq/{faq_id}", response_model=FAQRead)
async def update_faq(
    faq_id: uuid.UUID,
    data: FAQUpdate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.update_faq(faq_id, data)


@router.delete("/admin/faq/{faq_id}")
async def delete_faq(
    faq_id: uuid.UUID,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.delete_faq(faq_id)


# ── Admin Auto-Response CRUD ──


@router.get("/admin/auto-responses", response_model=list[AutoResponseRead])
async def list_auto_responses(
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.list_auto_responses()


@router.post("/admin/auto-responses", response_model=AutoResponseRead, status_code=201)
async def create_auto_response(
    data: AutoResponseCreate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.create_auto_response(data)


@router.put("/admin/auto-responses/{ar_id}", response_model=AutoResponseRead)
async def update_auto_response(
    ar_id: uuid.UUID,
    data: AutoResponseUpdate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.update_auto_response(ar_id, data)


@router.delete("/admin/auto-responses/{ar_id}")
async def delete_auto_response(
    ar_id: uuid.UUID,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user)
    return await svc.delete_auto_response(ar_id)
