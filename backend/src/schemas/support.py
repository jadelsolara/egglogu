import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Ticket ──

class TicketCreate(BaseModel):
    subject: str = Field(..., min_length=3, max_length=300)
    description: str = Field(..., min_length=10)
    priority: str = "medium"
    offline_id: Optional[str] = None  # for offline sync


class TicketMessageCreate(BaseModel):
    message: str = Field(..., min_length=1)


class TicketRatingCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class TicketRead(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: str
    category: str
    priority: str
    status: str
    sla_deadline: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    suggested_faq_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class TicketDetailRead(TicketRead):
    admin_notes: Optional[str] = None
    messages: list["MessageRead"] = []
    rating: Optional["RatingRead"] = None


class MessageRead(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    message: str
    is_admin: bool
    is_internal: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RatingRead(BaseModel):
    rating: int
    comment: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Admin ──

class AdminTicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    admin_notes: Optional[str] = None


class AdminReply(BaseModel):
    message: str = Field(..., min_length=1)
    is_internal: bool = False


class AdminAnalytics(BaseModel):
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    resolved_tickets: int
    avg_resolution_hours: Optional[float] = None
    avg_rating: Optional[float] = None
    total_ratings: int
    sla_compliance_pct: Optional[float] = None
    by_category: dict[str, int]
    by_priority: dict[str, int]


# ── FAQ ──

class FAQRead(BaseModel):
    id: uuid.UUID
    category: str
    title_es: str
    title_en: str
    content_es: str
    content_en: str
    helpful_yes: int
    helpful_no: int
    sort_order: int

    model_config = {"from_attributes": True}


class FAQCreate(BaseModel):
    category: str = "general"
    title_es: str = Field(..., min_length=3, max_length=300)
    title_en: str = Field(..., min_length=3, max_length=300)
    content_es: str = Field(..., min_length=10)
    content_en: str = Field(..., min_length=10)
    keywords: str = ""
    sort_order: int = 0


class FAQUpdate(BaseModel):
    category: Optional[str] = None
    title_es: Optional[str] = None
    title_en: Optional[str] = None
    content_es: Optional[str] = None
    content_en: Optional[str] = None
    keywords: Optional[str] = None
    is_published: Optional[bool] = None
    sort_order: Optional[int] = None


class HelpfulFeedback(BaseModel):
    helpful: bool


# ── Auto-Response ──

class AutoResponseRead(BaseModel):
    id: uuid.UUID
    category: str
    trigger_keywords: str
    response_es: str
    response_en: str
    is_active: bool
    sort_order: int

    model_config = {"from_attributes": True}


class AutoResponseCreate(BaseModel):
    category: str
    trigger_keywords: str = ""
    response_es: str = Field(..., min_length=5)
    response_en: str = Field(..., min_length=5)
    sort_order: int = 0


class AutoResponseUpdate(BaseModel):
    category: Optional[str] = None
    trigger_keywords: Optional[str] = None
    response_es: Optional[str] = None
    response_en: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


# ── Offline Sync ──

class OfflineTicket(BaseModel):
    offline_id: str
    subject: str
    description: str
    priority: str = "medium"
    created_at_local: datetime


class TicketSyncRequest(BaseModel):
    tickets: list[OfflineTicket]


class TicketSyncResponse(BaseModel):
    synced: int
    ticket_numbers: list[str]
