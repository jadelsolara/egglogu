import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_org_plan, require_role
from src.core.email_archive import archive_ticket, archive_ticket_reply
from src.core.exceptions import ForbiddenError, NotFoundError
from src.core.plans import get_plan_limits
from src.database import get_db
from src.models.auth import User
from src.models.support import (
    AutoResponse,
    FAQArticle,
    SupportRating,
    SupportTicket,
    TicketMessage,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    classify_ticket,
)
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

router = APIRouter(prefix="/support", tags=["support"])

# SLA hours — single plan, 4h response time
SLA_HOURS = {
    "suspended": None,
    "hobby": None,  # FAQ only
    "starter": 48,
    "pro": 12,
    "enterprise": 4,
}


async def _gen_ticket_number(db: AsyncSession) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"EGG-{today}-"
    result = await db.execute(
        select(func.count()).where(SupportTicket.ticket_number.like(f"{prefix}%"))
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


async def _find_matching_faq(text: str, db: AsyncSession) -> FAQArticle | None:
    """Find best FAQ match based on keyword overlap."""
    result = await db.execute(
        select(FAQArticle).where(FAQArticle.is_published.is_(True))
    )
    faqs = result.scalars().all()
    text_lower = text.lower()
    best, best_score = None, 0
    for faq in faqs:
        if not faq.keywords:
            continue
        keywords = [k.strip().lower() for k in faq.keywords.split(",") if k.strip()]
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > best_score:
            best, best_score = faq, score
    return best if best_score >= 2 else None


async def _get_auto_response(
    category: TicketCategory, text: str, db: AsyncSession
) -> AutoResponse | None:
    result = await db.execute(
        select(AutoResponse)
        .where(
            and_(AutoResponse.category == category, AutoResponse.is_active.is_(True))
        )
        .order_by(AutoResponse.sort_order)
    )
    responses = result.scalars().all()
    text_lower = text.lower()
    for resp in responses:
        if not resp.trigger_keywords:
            return resp
        triggers = [
            k.strip().lower() for k in resp.trigger_keywords.split(",") if k.strip()
        ]
        if not triggers or any(t in text_lower for t in triggers):
            return resp
    return None


# Supported language codes mapped to AutoResponse field suffixes.
# The app currently stores responses in _es and _en columns.
_SUPPORTED_LANGS = {"es", "en"}


def _detect_language(request: Request) -> str:
    """Detect preferred language from the Accept-Language header.

    Parses the standard Accept-Language header (e.g. "en-US,en;q=0.9,es;q=0.8")
    and returns the best matching supported language code.  Falls back to "es"
    (Spanish) when no supported language is found, since the majority of
    EGGlogU's user base is Spanish-speaking.
    """
    accept = request.headers.get("accept-language", "")
    if not accept:
        return "es"

    # Parse into (lang, quality) pairs.  Example value:
    #   "en-US,en;q=0.9,es;q=0.8" -> [("en-US",1.0), ("en",0.9), ("es",0.8)]
    weighted: list[tuple[str, float]] = []
    for part in accept.split(","):
        part = part.strip()
        if not part:
            continue
        if ";q=" in part:
            lang, q_str = part.split(";q=", 1)
            try:
                q = float(q_str.strip())
            except ValueError:
                q = 0.0
        else:
            lang = part
            q = 1.0
        # Normalise: "en-US" -> "en", "es-419" -> "es"
        lang = lang.strip().split("-")[0].lower()
        weighted.append((lang, q))

    # Sort by quality descending, pick first supported language
    weighted.sort(key=lambda x: x[1], reverse=True)
    for lang, _ in weighted:
        if lang in _SUPPORTED_LANGS:
            return lang

    return "es"


def _pick_auto_response_text(auto_resp: AutoResponse, lang: str) -> str:
    """Return the auto-response text in the detected language."""
    if lang == "en" and auto_resp.response_en:
        return auto_resp.response_en
    return auto_resp.response_es


# ══════════════════════════════════════════════
# PUBLIC — FAQ
# ══════════════════════════════════════════════


@router.get("/faq", response_model=list[FAQRead])
async def list_faq(
    q: str = Query("", max_length=200),
    category: str = Query("", max_length=30),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FAQArticle).where(FAQArticle.is_published.is_(True))
    if category:
        stmt = stmt.where(FAQArticle.category == category)
    if q:
        q_lower = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(FAQArticle.title_es).like(q_lower),
                func.lower(FAQArticle.title_en).like(q_lower),
                func.lower(FAQArticle.keywords).like(q_lower),
            )
        )
    stmt = stmt.order_by(FAQArticle.sort_order, FAQArticle.created_at)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/faq/{faq_id}/helpful")
async def faq_helpful(
    faq_id: uuid.UUID, data: HelpfulFeedback, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(FAQArticle).where(FAQArticle.id == faq_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise NotFoundError("FAQ article not found")
    if data.helpful:
        faq.helpful_yes += 1
    else:
        faq.helpful_no += 1
    return {"ok": True}


# ══════════════════════════════════════════════
# USER — Tickets
# ══════════════════════════════════════════════


@router.get("/tickets", response_model=list[TicketRead])
async def list_user_tickets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
    )
    return result.scalars().all()


@router.post("/tickets", response_model=TicketRead, status_code=201)
async def create_ticket(
    data: TicketCreate,
    request: Request,
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
    db: AsyncSession = Depends(get_db),
):
    limits = get_plan_limits(plan)
    max_tickets = limits.get("support_tickets")
    if max_tickets is not None:
        result = await db.execute(
            select(func.count()).where(
                and_(
                    SupportTicket.user_id == user.id,
                    SupportTicket.status.in_(["open", "in_progress", "waiting_user"]),
                )
            )
        )
        current = result.scalar() or 0
        if current >= max_tickets:
            raise ForbiddenError(
                f"Plan '{plan}' limit: max {max_tickets} open tickets. Close existing tickets or upgrade."
            )

    # Auto-classify
    category = classify_ticket(data.subject, data.description)
    priority = (
        TicketPriority(data.priority)
        if data.priority in TicketPriority.__members__
        else TicketPriority.medium
    )

    # SLA deadline
    sla_hours = SLA_HOURS.get(plan)
    sla_deadline = None
    if sla_hours:
        sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_hours)

    ticket_number = await _gen_ticket_number(db)

    # Check for matching FAQ
    combined_text = f"{data.subject} {data.description}"
    matching_faq = await _find_matching_faq(combined_text, db)

    ticket = SupportTicket(
        ticket_number=ticket_number,
        user_id=user.id,
        organization_id=user.organization_id,
        subject=data.subject,
        description=data.description,
        category=category,
        priority=priority,
        sla_deadline=sla_deadline,
        suggested_faq_id=matching_faq.id if matching_faq else None,
    )
    db.add(ticket)
    await db.flush()

    archive_ticket(
        ticket_number=ticket.ticket_number,
        user_email=user.email,
        subject=data.subject,
        description=data.description,
        category=category.value if hasattr(category, "value") else str(category),
        priority=priority.value if hasattr(priority, "value") else str(priority),
    )

    # Add auto-response as first message if available, in the user's language
    auto_resp = await _get_auto_response(category, combined_text, db)
    if auto_resp:
        lang = _detect_language(request)
        msg = TicketMessage(
            ticket_id=ticket.id,
            sender_id=user.id,
            message=_pick_auto_response_text(auto_resp, lang),
            is_admin=True,
            is_internal=False,
        )
        db.add(msg)
        await db.flush()

    return ticket


@router.get("/tickets/{ticket_id}", response_model=TicketDetailRead)
async def get_ticket(
    ticket_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(
            and_(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")

    # Messages (exclude internal notes for regular users)
    msg_result = await db.execute(
        select(TicketMessage)
        .where(
            and_(
                TicketMessage.ticket_id == ticket_id,
                TicketMessage.is_internal.is_(False),
            )
        )
        .order_by(TicketMessage.created_at)
    )
    messages = [MessageRead.model_validate(m) for m in msg_result.scalars().all()]

    # Rating
    rate_result = await db.execute(
        select(SupportRating).where(SupportRating.ticket_id == ticket_id)
    )
    rating_obj = rate_result.scalar_one_or_none()
    rating = RatingRead.model_validate(rating_obj) if rating_obj else None

    return TicketDetailRead(
        **{
            c.name: getattr(ticket, c.name)
            for c in SupportTicket.__table__.columns
            if c.name != "admin_notes"
        },
        admin_notes=None,
        messages=messages,
        rating=rating,
    )


@router.post(
    "/tickets/{ticket_id}/messages", response_model=MessageRead, status_code=201
)
async def add_message(
    ticket_id: uuid.UUID,
    data: TicketMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(
            and_(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")
    if ticket.status in (TicketStatus.closed,):
        raise ForbiddenError("Cannot message on a closed ticket")

    msg = TicketMessage(
        ticket_id=ticket_id,
        sender_id=user.id,
        message=data.message,
        is_admin=False,
        is_internal=False,
    )
    db.add(msg)
    await db.flush()

    archive_ticket_reply(
        ticket_number=ticket.ticket_number,
        from_email=user.email,
        message=data.message,
        is_admin=False,
    )

    # Reopen if waiting
    if ticket.status == TicketStatus.waiting_user:
        ticket.status = TicketStatus.in_progress

    return msg


@router.post("/tickets/{ticket_id}/close")
async def close_ticket(
    ticket_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(
            and_(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")
    ticket.status = TicketStatus.closed
    ticket.closed_at = datetime.now(timezone.utc)
    if not ticket.resolved_at:
        ticket.resolved_at = datetime.now(timezone.utc)
    return {"ok": True, "ticket_number": ticket.ticket_number}


@router.post("/tickets/{ticket_id}/rate", response_model=RatingRead, status_code=201)
async def rate_ticket(
    ticket_id: uuid.UUID,
    data: TicketRatingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(
            and_(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")

    # Check no existing rating
    existing = await db.execute(
        select(SupportRating).where(SupportRating.ticket_id == ticket_id)
    )
    if existing.scalar_one_or_none():
        raise ForbiddenError("Ticket already rated")

    rating = SupportRating(
        ticket_id=ticket_id,
        user_id=user.id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(rating)
    await db.flush()
    return rating


@router.post("/tickets/sync", response_model=TicketSyncResponse)
async def sync_offline_tickets(
    data: TicketSyncRequest,
    user: User = Depends(get_current_user),
    plan: str = Depends(get_org_plan),
    db: AsyncSession = Depends(get_db),
):
    synced = 0
    numbers = []
    for t in data.tickets:
        category = classify_ticket(t.subject, t.description)
        sla_hours = SLA_HOURS.get(plan)
        sla_deadline = None
        if sla_hours:
            sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_hours)

        ticket_number = await _gen_ticket_number(db)
        ticket = SupportTicket(
            ticket_number=ticket_number,
            user_id=user.id,
            organization_id=user.organization_id,
            subject=t.subject,
            description=t.description,
            category=category,
            priority=TicketPriority(t.priority)
            if t.priority in TicketPriority.__members__
            else TicketPriority.medium,
            sla_deadline=sla_deadline,
        )
        db.add(ticket)
        archive_ticket(
            ticket_number=ticket_number,
            user_email=user.email,
            subject=t.subject,
            description=t.description,
            category=category.value if hasattr(category, "value") else str(category),
            priority=ticket.priority.value
            if hasattr(ticket.priority, "value")
            else str(ticket.priority),
        )
        synced += 1
        numbers.append(ticket_number)

    await db.flush()
    return TicketSyncResponse(synced=synced, ticket_numbers=numbers)


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
    stmt = select(SupportTicket).where(
        SupportTicket.organization_id == user.organization_id
    )
    if status:
        stmt = stmt.where(SupportTicket.status == status)
    if category:
        stmt = stmt.where(SupportTicket.category == category)
    if priority:
        stmt = stmt.where(SupportTicket.priority == priority)
    stmt = stmt.order_by(SupportTicket.created_at.desc())
    stmt = stmt.offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/admin/tickets/{ticket_id}", response_model=TicketRead)
async def admin_update_ticket(
    ticket_id: uuid.UUID,
    data: AdminTicketUpdate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(
            and_(
                SupportTicket.id == ticket_id,
                SupportTicket.organization_id == user.organization_id,
            )
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")

    if data.status:
        ticket.status = TicketStatus(data.status)
        if data.status == "resolved" and not ticket.resolved_at:
            ticket.resolved_at = datetime.now(timezone.utc)
    if data.priority:
        ticket.priority = TicketPriority(data.priority)
    if data.category:
        ticket.category = TicketCategory(data.category)
    if data.admin_notes is not None:
        ticket.admin_notes = data.admin_notes

    return ticket


@router.post(
    "/admin/tickets/{ticket_id}/reply", response_model=MessageRead, status_code=201
)
async def admin_reply(
    ticket_id: uuid.UUID,
    data: AdminReply,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket).where(
            and_(
                SupportTicket.id == ticket_id,
                SupportTicket.organization_id == user.organization_id,
            )
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise NotFoundError("Ticket not found")

    msg = TicketMessage(
        ticket_id=ticket_id,
        sender_id=user.id,
        message=data.message,
        is_admin=True,
        is_internal=data.is_internal,
    )
    db.add(msg)
    await db.flush()

    if not data.is_internal:
        archive_ticket_reply(
            ticket_number=ticket.ticket_number,
            from_email=user.email,
            message=data.message,
            is_admin=True,
        )

    if not data.is_internal and ticket.status == TicketStatus.open:
        ticket.status = TicketStatus.in_progress

    return msg


@router.get("/admin/analytics", response_model=AdminAnalytics)
async def admin_analytics(
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    org_id = user.organization_id
    base = SupportTicket.organization_id == org_id

    total = (await db.execute(select(func.count()).where(base))).scalar() or 0
    open_t = (
        await db.execute(
            select(func.count()).where(
                and_(base, SupportTicket.status == TicketStatus.open)
            )
        )
    ).scalar() or 0
    in_prog = (
        await db.execute(
            select(func.count()).where(
                and_(base, SupportTicket.status == TicketStatus.in_progress)
            )
        )
    ).scalar() or 0
    resolved = (
        await db.execute(
            select(func.count()).where(
                and_(base, SupportTicket.status.in_(["resolved", "closed"]))
            )
        )
    ).scalar() or 0

    # Avg resolution time
    avg_res = None
    res_result = await db.execute(
        select(SupportTicket.created_at, SupportTicket.resolved_at).where(
            and_(base, SupportTicket.resolved_at.isnot(None))
        )
    )
    resolved_tickets = res_result.all()
    if resolved_tickets:
        total_hours = sum(
            (r.resolved_at - r.created_at).total_seconds() / 3600
            for r in resolved_tickets
        )
        avg_res = round(total_hours / len(resolved_tickets), 1)

    # Avg rating
    rating_result = await db.execute(
        select(func.avg(SupportRating.rating), func.count(SupportRating.id)).where(
            SupportRating.ticket_id.in_(select(SupportTicket.id).where(base))
        )
    )
    rating_row = rating_result.one()
    avg_rating = round(float(rating_row[0]), 1) if rating_row[0] else None
    total_ratings = rating_row[1] or 0

    # SLA compliance
    sla_result = await db.execute(
        select(SupportTicket.sla_deadline, SupportTicket.resolved_at).where(
            and_(
                base,
                SupportTicket.sla_deadline.isnot(None),
                SupportTicket.resolved_at.isnot(None),
            )
        )
    )
    sla_tickets = sla_result.all()
    sla_pct = None
    if sla_tickets:
        met = sum(1 for t in sla_tickets if t.resolved_at <= t.sla_deadline)
        sla_pct = round(met / len(sla_tickets) * 100, 1)

    # By category
    cat_result = await db.execute(
        select(SupportTicket.category, func.count())
        .where(base)
        .group_by(SupportTicket.category)
    )
    by_category = {
        str(r[0].value) if hasattr(r[0], "value") else str(r[0]): r[1]
        for r in cat_result.all()
    }

    # By priority
    pri_result = await db.execute(
        select(SupportTicket.priority, func.count())
        .where(base)
        .group_by(SupportTicket.priority)
    )
    by_priority = {
        str(r[0].value) if hasattr(r[0], "value") else str(r[0]): r[1]
        for r in pri_result.all()
    }

    return AdminAnalytics(
        total_tickets=total,
        open_tickets=open_t,
        in_progress_tickets=in_prog,
        resolved_tickets=resolved,
        avg_resolution_hours=avg_res,
        avg_rating=avg_rating,
        total_ratings=total_ratings,
        sla_compliance_pct=sla_pct,
        by_category=by_category,
        by_priority=by_priority,
    )


# ── Admin FAQ CRUD ──


@router.post("/admin/faq", response_model=FAQRead, status_code=201)
async def create_faq(
    data: FAQCreate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    faq = FAQArticle(
        category=TicketCategory(data.category),
        title_es=data.title_es,
        title_en=data.title_en,
        content_es=data.content_es,
        content_en=data.content_en,
        keywords=data.keywords,
        sort_order=data.sort_order,
    )
    db.add(faq)
    await db.flush()
    return faq


@router.put("/admin/faq/{faq_id}", response_model=FAQRead)
async def update_faq(
    faq_id: uuid.UUID,
    data: FAQUpdate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FAQArticle).where(FAQArticle.id == faq_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise NotFoundError("FAQ not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        if field == "category" and val:
            setattr(faq, field, TicketCategory(val))
        else:
            setattr(faq, field, val)
    await db.flush()
    return faq


@router.delete("/admin/faq/{faq_id}")
async def delete_faq(
    faq_id: uuid.UUID,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FAQArticle).where(FAQArticle.id == faq_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise NotFoundError("FAQ not found")
    await db.delete(faq)
    return {"ok": True}


# ── Admin Auto-Response CRUD ──


@router.get("/admin/auto-responses", response_model=list[AutoResponseRead])
async def list_auto_responses(
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AutoResponse).order_by(AutoResponse.category, AutoResponse.sort_order)
    )
    return result.scalars().all()


@router.post("/admin/auto-responses", response_model=AutoResponseRead, status_code=201)
async def create_auto_response(
    data: AutoResponseCreate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    ar = AutoResponse(
        category=TicketCategory(data.category),
        trigger_keywords=data.trigger_keywords,
        response_es=data.response_es,
        response_en=data.response_en,
        sort_order=data.sort_order,
    )
    db.add(ar)
    await db.flush()
    return ar


@router.put("/admin/auto-responses/{ar_id}", response_model=AutoResponseRead)
async def update_auto_response(
    ar_id: uuid.UUID,
    data: AutoResponseUpdate,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutoResponse).where(AutoResponse.id == ar_id))
    ar = result.scalar_one_or_none()
    if not ar:
        raise NotFoundError("Auto-response not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        if field == "category" and val:
            setattr(ar, field, TicketCategory(val))
        else:
            setattr(ar, field, val)
    await db.flush()
    return ar


@router.delete("/admin/auto-responses/{ar_id}")
async def delete_auto_response(
    ar_id: uuid.UUID,
    user: User = Depends(require_role("owner", "manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AutoResponse).where(AutoResponse.id == ar_id))
    ar = result.scalar_one_or_none()
    if not ar:
        raise NotFoundError("Auto-response not found")
    await db.delete(ar)
    return {"ok": True}
