import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class TicketStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    waiting_user = "waiting_user"
    resolved = "resolved"
    closed = "closed"


class TicketPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TicketCategory(str, enum.Enum):
    produccion = "produccion"
    sanidad = "sanidad"
    alimento = "alimento"
    iot = "iot"
    billing = "billing"
    bug = "bug"
    sync = "sync"
    feature_request = "feature_request"
    acceso = "acceso"
    general = "general"


# Keywords for auto-classification (ES + EN)
CATEGORY_KEYWORDS = {
    TicketCategory.produccion: [
        "produccion", "production", "huevos", "eggs", "postura", "lay",
        "hen-day", "cascara", "shell", "roto", "broken", "calidad", "quality",
    ],
    TicketCategory.sanidad: [
        "vacuna", "vaccine", "enfermedad", "disease", "mortalidad", "mortality",
        "brote", "outbreak", "medicamento", "medication", "veterinario", "vet",
        "sintoma", "symptom",
    ],
    TicketCategory.alimento: [
        "alimento", "feed", "fcr", "conversion", "consumo", "consumption",
        "stock", "kg", "nutricion", "nutrition", "transicion",
    ],
    TicketCategory.iot: [
        "sensor", "mqtt", "iot", "temperatura", "temperature", "humedad",
        "humidity", "amoniaco", "ammonia", "lectura", "reading",
    ],
    TicketCategory.billing: [
        "plan", "pago", "payment", "factura", "invoice", "suscripcion",
        "subscription", "upgrade", "downgrade", "stripe", "cobro", "charge",
        "precio", "price", "cancelar", "cancel",
    ],
    TicketCategory.bug: [
        "bug", "error", "crash", "falla", "fail", "no funciona", "not working",
        "pantalla", "screen", "blank", "blanco",
    ],
    TicketCategory.sync: [
        "sync", "sincronizar", "offline", "datos", "data", "backup",
        "restaurar", "restore", "perdido", "lost",
    ],
    TicketCategory.feature_request: [
        "feature", "funcionalidad", "sugerencia", "suggestion", "solicitud",
        "request", "mejorar", "improve", "agregar", "add",
    ],
    TicketCategory.acceso: [
        "password", "contraseña", "login", "acceso", "access", "cuenta",
        "account", "verificar", "verify", "email", "google",
    ],
}


class SupportTicket(TimestampMixin, TenantMixin, Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[TicketCategory] = mapped_column(default=TicketCategory.general)
    priority: Mapped[TicketPriority] = mapped_column(default=TicketPriority.medium)
    status: Mapped[TicketStatus] = mapped_column(default=TicketStatus.open)
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    suggested_faq_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("faq_articles.id", ondelete="SET NULL"), default=None
    )


class TicketMessage(TimestampMixin, Base):
    __tablename__ = "ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    message: Mapped[str] = mapped_column(Text)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)


class SupportRating(TimestampMixin, Base):
    __tablename__ = "support_ratings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)  # 1-5
    comment: Mapped[Optional[str]] = mapped_column(Text, default=None)


class FAQArticle(TimestampMixin, Base):
    __tablename__ = "faq_articles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category: Mapped[TicketCategory] = mapped_column(default=TicketCategory.general)
    title_es: Mapped[str] = mapped_column(String(300))
    title_en: Mapped[str] = mapped_column(String(300))
    content_es: Mapped[str] = mapped_column(Text)
    content_en: Mapped[str] = mapped_column(Text)
    keywords: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    helpful_yes: Mapped[int] = mapped_column(Integer, default=0)
    helpful_no: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class AutoResponse(TimestampMixin, Base):
    __tablename__ = "auto_responses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    category: Mapped[TicketCategory] = mapped_column(index=True)
    trigger_keywords: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    response_es: Mapped[str] = mapped_column(Text)
    response_en: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


def classify_ticket(subject: str, description: str) -> TicketCategory:
    """Auto-classify ticket based on keywords in subject + description."""
    text = f"{subject} {description}".lower()
    scores: dict[TicketCategory, int] = {}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > 0:
            scores[cat] = score
    if scores:
        return max(scores, key=scores.get)
    return TicketCategory.general
