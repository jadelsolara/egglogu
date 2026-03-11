"""SupportService — Support tickets, FAQ, auto-responses, analytics."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, and_, or_

from src.core.email_archive import archive_ticket, archive_ticket_reply
from src.core.exceptions import ForbiddenError, NotFoundError
from src.core.plans import get_plan_limits
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
    MessageRead,
    RatingRead,
    TicketDetailRead,
)
from src.services.base import BaseService

# SLA hours per plan
SLA_HOURS = {
    "suspended": None,
    "hobby": None,
    "starter": 48,
    "pro": 12,
    "enterprise": 4,
}

# Supported language codes
_SUPPORTED_LANGS = {"es", "en"}


class SupportService(BaseService):
    # ── Helpers ───────────────────────────────────────────────────

    async def _gen_ticket_number(self) -> str:
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        prefix = f"EGG-{today}-"
        result = await self.db.execute(
            select(func.count()).where(SupportTicket.ticket_number.like(f"{prefix}%"))
        )
        count = result.scalar() or 0
        return f"{prefix}{count + 1:03d}"

    async def _find_matching_faq(self, text: str) -> FAQArticle | None:
        result = await self.db.execute(
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
        self, category: TicketCategory, text: str
    ) -> AutoResponse | None:
        result = await self.db.execute(
            select(AutoResponse)
            .where(
                and_(
                    AutoResponse.category == category, AutoResponse.is_active.is_(True)
                )
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

    @staticmethod
    def detect_language(accept_header: str) -> str:
        if not accept_header:
            return "es"
        weighted: list[tuple[str, float]] = []
        for part in accept_header.split(","):
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
            lang = lang.strip().split("-")[0].lower()
            weighted.append((lang, q))
        weighted.sort(key=lambda x: x[1], reverse=True)
        for lang, _ in weighted:
            if lang in _SUPPORTED_LANGS:
                return lang
        return "es"

    @staticmethod
    def _pick_auto_response_text(auto_resp: AutoResponse, lang: str) -> str:
        if lang == "en" and auto_resp.response_en:
            return auto_resp.response_en
        return auto_resp.response_es

    # ── PUBLIC — FAQ ──────────────────────────────────────────────

    async def list_faq(self, q: str = "", category: str = "") -> list:
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
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def faq_helpful(self, faq_id: uuid.UUID, helpful: bool) -> dict:
        result = await self.db.execute(
            select(FAQArticle).where(FAQArticle.id == faq_id)
        )
        faq = result.scalar_one_or_none()
        if not faq:
            raise NotFoundError("FAQ article not found")
        if helpful:
            faq.helpful_yes += 1
        else:
            faq.helpful_no += 1
        return {"ok": True}

    # ── USER — Tickets ────────────────────────────────────────────

    async def list_user_tickets(self) -> list:
        result = await self.db.execute(
            select(SupportTicket)
            .where(SupportTicket.user_id == self.user_id)
            .order_by(SupportTicket.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_ticket(
        self,
        subject: str,
        description: str,
        priority_str: str | None,
        plan: str,
        user_email: str,
        accept_language: str = "",
    ) -> SupportTicket:
        limits = get_plan_limits(plan)
        max_tickets = limits.get("support_tickets")
        if max_tickets is not None:
            result = await self.db.execute(
                select(func.count()).where(
                    and_(
                        SupportTicket.user_id == self.user_id,
                        SupportTicket.status.in_(
                            ["open", "in_progress", "waiting_user"]
                        ),
                    )
                )
            )
            current = result.scalar() or 0
            if current >= max_tickets:
                raise ForbiddenError(
                    f"Plan '{plan}' limit: max {max_tickets} open tickets. "
                    "Close existing tickets or upgrade."
                )

        category = classify_ticket(subject, description)
        priority = (
            TicketPriority(priority_str)
            if priority_str in TicketPriority.__members__
            else TicketPriority.medium
        )

        sla_hours = SLA_HOURS.get(plan)
        sla_deadline = None
        if sla_hours:
            sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_hours)

        ticket_number = await self._gen_ticket_number()
        combined_text = f"{subject} {description}"
        matching_faq = await self._find_matching_faq(combined_text)

        ticket = SupportTicket(
            ticket_number=ticket_number,
            user_id=self.user_id,
            organization_id=self.org_id,
            subject=subject,
            description=description,
            category=category,
            priority=priority,
            sla_deadline=sla_deadline,
            suggested_faq_id=matching_faq.id if matching_faq else None,
        )
        self.db.add(ticket)
        await self.db.flush()

        archive_ticket(
            ticket_number=ticket.ticket_number,
            user_email=user_email,
            subject=subject,
            description=description,
            category=category.value if hasattr(category, "value") else str(category),
            priority=priority.value if hasattr(priority, "value") else str(priority),
        )

        auto_resp = await self._get_auto_response(category, combined_text)
        if auto_resp:
            lang = self.detect_language(accept_language)
            msg = TicketMessage(
                ticket_id=ticket.id,
                sender_id=self.user_id,
                message=self._pick_auto_response_text(auto_resp, lang),
                is_admin=True,
                is_internal=False,
            )
            self.db.add(msg)
            await self.db.flush()

        return ticket

    async def get_ticket(self, ticket_id: uuid.UUID) -> TicketDetailRead:
        result = await self.db.execute(
            select(SupportTicket).where(
                and_(
                    SupportTicket.id == ticket_id, SupportTicket.user_id == self.user_id
                )
            )
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise NotFoundError("Ticket not found")

        msg_result = await self.db.execute(
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

        rate_result = await self.db.execute(
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

    async def add_message(
        self, ticket_id: uuid.UUID, message: str, user_email: str
    ) -> TicketMessage:
        result = await self.db.execute(
            select(SupportTicket).where(
                and_(
                    SupportTicket.id == ticket_id, SupportTicket.user_id == self.user_id
                )
            )
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise NotFoundError("Ticket not found")
        if ticket.status in (TicketStatus.closed,):
            raise ForbiddenError("Cannot message on a closed ticket")

        msg = TicketMessage(
            ticket_id=ticket_id,
            sender_id=self.user_id,
            message=message,
            is_admin=False,
            is_internal=False,
        )
        self.db.add(msg)
        await self.db.flush()

        archive_ticket_reply(
            ticket_number=ticket.ticket_number,
            from_email=user_email,
            message=message,
            is_admin=False,
        )

        if ticket.status == TicketStatus.waiting_user:
            ticket.status = TicketStatus.in_progress

        return msg

    async def close_ticket(self, ticket_id: uuid.UUID) -> dict:
        result = await self.db.execute(
            select(SupportTicket).where(
                and_(
                    SupportTicket.id == ticket_id, SupportTicket.user_id == self.user_id
                )
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

    async def rate_ticket(
        self, ticket_id: uuid.UUID, rating: int, comment: str | None
    ) -> SupportRating:
        result = await self.db.execute(
            select(SupportTicket).where(
                and_(
                    SupportTicket.id == ticket_id, SupportTicket.user_id == self.user_id
                )
            )
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise NotFoundError("Ticket not found")

        existing = await self.db.execute(
            select(SupportRating).where(SupportRating.ticket_id == ticket_id)
        )
        if existing.scalar_one_or_none():
            raise ForbiddenError("Ticket already rated")

        rating_obj = SupportRating(
            ticket_id=ticket_id,
            user_id=self.user_id,
            rating=rating,
            comment=comment,
        )
        self.db.add(rating_obj)
        await self.db.flush()
        return rating_obj

    async def sync_offline_tickets(
        self, tickets_data: list, plan: str, user_email: str
    ) -> dict:
        synced = 0
        numbers = []
        for t in tickets_data:
            category = classify_ticket(t.subject, t.description)
            sla_hours = SLA_HOURS.get(plan)
            sla_deadline = None
            if sla_hours:
                sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_hours)

            ticket_number = await self._gen_ticket_number()
            ticket = SupportTicket(
                ticket_number=ticket_number,
                user_id=self.user_id,
                organization_id=self.org_id,
                subject=t.subject,
                description=t.description,
                category=category,
                priority=TicketPriority(t.priority)
                if t.priority in TicketPriority.__members__
                else TicketPriority.medium,
                sla_deadline=sla_deadline,
            )
            self.db.add(ticket)
            archive_ticket(
                ticket_number=ticket_number,
                user_email=user_email,
                subject=t.subject,
                description=t.description,
                category=category.value
                if hasattr(category, "value")
                else str(category),
                priority=ticket.priority.value
                if hasattr(ticket.priority, "value")
                else str(ticket.priority),
            )
            synced += 1
            numbers.append(ticket_number)

        await self.db.flush()
        return {"synced": synced, "ticket_numbers": numbers}

    # ── ADMIN — Contact Center ────────────────────────────────────

    async def admin_list_tickets(
        self,
        status: str = "",
        category: str = "",
        priority: str = "",
        page: int = 1,
        size: int = 50,
    ) -> list:
        stmt = select(SupportTicket).where(SupportTicket.organization_id == self.org_id)
        if status:
            stmt = stmt.where(SupportTicket.status == status)
        if category:
            stmt = stmt.where(SupportTicket.category == category)
        if priority:
            stmt = stmt.where(SupportTicket.priority == priority)
        stmt = stmt.order_by(SupportTicket.created_at.desc())
        stmt = stmt.offset((page - 1) * size).limit(size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def admin_update_ticket(self, ticket_id: uuid.UUID, data) -> SupportTicket:
        result = await self.db.execute(
            select(SupportTicket).where(
                and_(
                    SupportTicket.id == ticket_id,
                    SupportTicket.organization_id == self.org_id,
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

    async def admin_reply(
        self, ticket_id: uuid.UUID, message: str, is_internal: bool, user_email: str
    ) -> TicketMessage:
        result = await self.db.execute(
            select(SupportTicket).where(
                and_(
                    SupportTicket.id == ticket_id,
                    SupportTicket.organization_id == self.org_id,
                )
            )
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise NotFoundError("Ticket not found")

        msg = TicketMessage(
            ticket_id=ticket_id,
            sender_id=self.user_id,
            message=message,
            is_admin=True,
            is_internal=is_internal,
        )
        self.db.add(msg)
        await self.db.flush()

        if not is_internal:
            archive_ticket_reply(
                ticket_number=ticket.ticket_number,
                from_email=user_email,
                message=message,
                is_admin=True,
            )

        if not is_internal and ticket.status == TicketStatus.open:
            ticket.status = TicketStatus.in_progress

        return msg

    async def admin_analytics(self) -> AdminAnalytics:
        base = SupportTicket.organization_id == self.org_id

        total = (await self.db.execute(select(func.count()).where(base))).scalar() or 0
        open_t = (
            await self.db.execute(
                select(func.count()).where(
                    and_(base, SupportTicket.status == TicketStatus.open)
                )
            )
        ).scalar() or 0
        in_prog = (
            await self.db.execute(
                select(func.count()).where(
                    and_(base, SupportTicket.status == TicketStatus.in_progress)
                )
            )
        ).scalar() or 0
        resolved = (
            await self.db.execute(
                select(func.count()).where(
                    and_(base, SupportTicket.status.in_(["resolved", "closed"]))
                )
            )
        ).scalar() or 0

        avg_res = None
        res_result = await self.db.execute(
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

        rating_result = await self.db.execute(
            select(func.avg(SupportRating.rating), func.count(SupportRating.id)).where(
                SupportRating.ticket_id.in_(select(SupportTicket.id).where(base))
            )
        )
        rating_row = rating_result.one()
        avg_rating = round(float(rating_row[0]), 1) if rating_row[0] else None
        total_ratings = rating_row[1] or 0

        sla_result = await self.db.execute(
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

        cat_result = await self.db.execute(
            select(SupportTicket.category, func.count())
            .where(base)
            .group_by(SupportTicket.category)
        )
        by_category = {
            str(r[0].value) if hasattr(r[0], "value") else str(r[0]): r[1]
            for r in cat_result.all()
        }

        pri_result = await self.db.execute(
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

    # ── Admin FAQ CRUD ────────────────────────────────────────────

    async def create_faq(self, data) -> FAQArticle:
        faq = FAQArticle(
            category=TicketCategory(data.category),
            title_es=data.title_es,
            title_en=data.title_en,
            content_es=data.content_es,
            content_en=data.content_en,
            keywords=data.keywords,
            sort_order=data.sort_order,
        )
        self.db.add(faq)
        await self.db.flush()
        return faq

    async def update_faq(self, faq_id: uuid.UUID, data) -> FAQArticle:
        result = await self.db.execute(
            select(FAQArticle).where(FAQArticle.id == faq_id)
        )
        faq = result.scalar_one_or_none()
        if not faq:
            raise NotFoundError("FAQ not found")
        for field, val in data.model_dump(exclude_unset=True).items():
            if field == "category" and val:
                setattr(faq, field, TicketCategory(val))
            else:
                setattr(faq, field, val)
        await self.db.flush()
        return faq

    async def delete_faq(self, faq_id: uuid.UUID) -> dict:
        result = await self.db.execute(
            select(FAQArticle).where(FAQArticle.id == faq_id)
        )
        faq = result.scalar_one_or_none()
        if not faq:
            raise NotFoundError("FAQ not found")
        await self.db.delete(faq)
        return {"ok": True}

    # ── Admin Auto-Response CRUD ──────────────────────────────────

    async def list_auto_responses(self) -> list:
        result = await self.db.execute(
            select(AutoResponse).order_by(
                AutoResponse.category, AutoResponse.sort_order
            )
        )
        return list(result.scalars().all())

    async def create_auto_response(self, data) -> AutoResponse:
        ar = AutoResponse(
            category=TicketCategory(data.category),
            trigger_keywords=data.trigger_keywords,
            response_es=data.response_es,
            response_en=data.response_en,
            sort_order=data.sort_order,
        )
        self.db.add(ar)
        await self.db.flush()
        return ar

    async def update_auto_response(self, ar_id: uuid.UUID, data) -> AutoResponse:
        result = await self.db.execute(
            select(AutoResponse).where(AutoResponse.id == ar_id)
        )
        ar = result.scalar_one_or_none()
        if not ar:
            raise NotFoundError("Auto-response not found")
        for field, val in data.model_dump(exclude_unset=True).items():
            if field == "category" and val:
                setattr(ar, field, TicketCategory(val))
            else:
                setattr(ar, field, val)
        await self.db.flush()
        return ar

    async def delete_auto_response(self, ar_id: uuid.UUID) -> dict:
        result = await self.db.execute(
            select(AutoResponse).where(AutoResponse.id == ar_id)
        )
        ar = result.scalar_one_or_none()
        if not ar:
            raise NotFoundError("Auto-response not found")
        await self.db.delete(ar)
        return {"ok": True}
