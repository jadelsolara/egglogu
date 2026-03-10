import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Market Intelligence ──────────────────────────────────────────


class MarketIntelligenceCreate(BaseModel):
    report_date: date
    region: str = Field(..., min_length=1, max_length=100)
    egg_type: str = Field(..., min_length=1, max_length=50)
    avg_price_per_unit: float = Field(..., gt=0)
    total_production_units: int = Field(default=0, ge=0)
    demand_index: float = Field(default=0.0, ge=0)
    supply_index: float = Field(default=0.0, ge=0)
    price_trend: str = Field(default="stable")
    notes: Optional[str] = None
    source: Optional[str] = None


class MarketIntelligenceRead(BaseModel):
    id: uuid.UUID
    report_date: date
    region: str
    egg_type: str
    avg_price_per_unit: float
    total_production_units: int
    demand_index: float
    supply_index: float
    price_trend: str
    notes: Optional[str] = None
    source: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MarketSummary(BaseModel):
    region: str
    avg_price: float
    total_production: int
    avg_demand: float
    avg_supply: float
    dominant_trend: str
    entries_count: int


# ── Global Inventory ─────────────────────────────────────────────


class GlobalInventoryItem(BaseModel):
    organization_id: uuid.UUID
    organization_name: str
    total_stock: int
    stock_by_size: dict
    stock_by_type: dict
    last_movement_date: Optional[date] = None


# ── Organizations ────────────────────────────────────────────────


class OrganizationOverview(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    tier: str
    plan: Optional[str] = None
    plan_status: Optional[str] = None
    is_trial: bool = False
    user_count: int = 0
    farm_count: int = 0
    created_at: datetime
    is_active: bool = True
    last_activity: Optional[datetime] = None

    model_config = {"from_attributes": True}


class OrganizationDetail(OrganizationOverview):
    users: list[dict] = []
    farms: list[dict] = []
    subscription: Optional[dict] = None
    total_flocks: int = 0
    total_eggs_in_stock: int = 0
    open_tickets: int = 0


class OrganizationPatch(BaseModel):
    is_active: Optional[bool] = None


# ── Users ────────────────────────────────────────────────────────


class UserOverview(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    organization_id: Optional[uuid.UUID] = None
    organization_name: Optional[str] = None
    is_active: bool
    email_verified: bool
    created_at: datetime
    geo_country: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Churn Analysis ───────────────────────────────────────────────


class ChurnDataPoint(BaseModel):
    month: str
    churned: int
    total: int
    churn_rate: float


class ChurnAnalysis(BaseModel):
    monthly_churn_rate: float
    retention_rate: float
    churned_orgs: list[dict]
    trend: list[ChurnDataPoint]


# ── Platform Stats ───────────────────────────────────────────────


class PlatformStats(BaseModel):
    total_organizations: int = 0
    active_organizations: int = 0
    total_users: int = 0
    active_users: int = 0
    total_farms: int = 0
    total_flocks: int = 0
    total_eggs_in_stock: int = 0
    open_tickets: int = 0
    resolved_tickets_30d: int = 0
    avg_resolution_hours: Optional[float] = None
    total_tickets: int = 0
    bug_tickets: int = 0
    feature_requests: int = 0
    critical_tickets: int = 0
    mrr_estimated: float = 0.0
    plan_distribution: dict = {}
    new_orgs_30d: int = 0
    new_users_30d: int = 0
    ticket_response_avg_hours: Optional[float] = None
    sla_compliance_pct: Optional[float] = None
    avg_support_rating: Optional[float] = None


# ── Tickets (cross-tenant) ───────────────────────────────────────


class TicketOverview(BaseModel):
    id: uuid.UUID
    ticket_number: str
    organization_id: uuid.UUID
    organization_name: Optional[str] = None
    user_id: uuid.UUID
    user_email: Optional[str] = None
    subject: str
    category: str
    priority: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    sla_deadline: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BulkDeleteRequest(BaseModel):
    ticket_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=100)


# ── CRM Schemas ──────────────────────────────────────────────────


class CustomerNoteCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    note_type: str = Field(default="general")
    is_pinned: bool = False


class CustomerNoteRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    author_id: Optional[uuid.UUID] = None
    content: str
    note_type: str
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerNoteUpdate(BaseModel):
    content: Optional[str] = None
    note_type: Optional[str] = None
    is_pinned: Optional[bool] = None


class ManualDiscountCreate(BaseModel):
    percent_off: int = Field(..., ge=1, le=100)
    duration_months: int = Field(..., ge=1, le=36)
    reason: str = Field(..., min_length=1, max_length=500)


class ManualDiscountRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    applied_by: Optional[uuid.UUID] = None
    percent_off: int
    duration_months: int
    reason: str
    stripe_coupon_id: Optional[str] = None
    is_active: bool
    expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RetentionRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    trigger_type: str
    conditions: dict = {}
    discount_percent: int = Field(default=0, ge=0, le=100)
    action_type: str = "flag_for_review"
    email_template_key: Optional[str] = None


class RetentionRuleRead(BaseModel):
    id: uuid.UUID
    name: str
    trigger_type: str
    conditions: dict
    discount_percent: int
    action_type: str
    email_template_key: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RetentionRuleUpdate(BaseModel):
    name: Optional[str] = None
    trigger_type: Optional[str] = None
    conditions: Optional[dict] = None
    discount_percent: Optional[int] = Field(default=None, ge=0, le=100)
    action_type: Optional[str] = None
    email_template_key: Optional[str] = None
    is_active: Optional[bool] = None


class RetentionEventRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    rule_id: Optional[uuid.UUID] = None
    trigger_type: str
    action_taken: str
    result: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CreditNoteCreate(BaseModel):
    amount_cents: int = Field(..., gt=0)
    currency: str = Field(default="usd", max_length=3)
    reason: str = Field(..., min_length=1, max_length=500)
    stripe_invoice_id: Optional[str] = None


class CreditNoteRead(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    issued_by: Optional[uuid.UUID] = None
    amount_cents: int
    currency: str
    reason: str
    stripe_credit_note_id: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RefundRequest(BaseModel):
    payment_intent_id: str
    amount_cents: Optional[int] = None
    reason: str = Field(default="requested_by_customer", max_length=500)


class ChangePlanRequest(BaseModel):
    new_plan: str = Field(..., pattern="^(hobby|starter|pro|enterprise)$")
    interval: str = Field(default="month", pattern="^(month|year)$")


class CRM360Response(BaseModel):
    organization: dict
    subscription: Optional[dict] = None
    health: dict
    ltv: dict
    users: list[dict] = []
    farms: list[dict] = []
    notes: list[CustomerNoteRead] = []
    discounts: list[ManualDiscountRead] = []
    credit_notes: list[CreditNoteRead] = []
    open_tickets: int = 0
    total_flocks: int = 0
    total_eggs_in_stock: int = 0


class CRMReportResponse(BaseModel):
    total_orgs: int = 0
    active_orgs: int = 0
    avg_health_score: float = 0.0
    risk_distribution: dict = {}
    total_ltv: float = 0.0
    avg_ltv: float = 0.0
    active_discounts: int = 0
    retention_events_30d: int = 0
    credit_notes_total_cents: int = 0


# ── Outbreak Alerts (geo-targeted) ──────────────────────────────


class OutbreakAlertCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    disease: str = Field(..., min_length=1, max_length=200)
    severity: str = Field(default="moderate", pattern="^(low|moderate|high|critical)$")
    transmission: str = Field(default="unknown", pattern="^(airborne|contact|vector|waterborne|fomite|unknown)$")
    species_affected: str = Field(default="poultry", max_length=300)
    epicenter_lat: float = Field(..., ge=-90, le=90)
    epicenter_lng: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(default=100.0, gt=0, le=20000)
    region_name: str = Field(..., min_length=1, max_length=200)
    detected_date: date
    expires_at: Optional[datetime] = None
    description: Optional[str] = None
    contingency_protocol: Optional[str] = None
    source_url: Optional[str] = None
    confirmed_cases: int = Field(default=0, ge=0)
    deaths_reported: int = Field(default=0, ge=0)
    spread_speed_km_day: Optional[float] = Field(default=None, ge=0)
    spread_direction: Optional[str] = Field(default=None, max_length=50)


class OutbreakAlertRead(BaseModel):
    id: uuid.UUID
    title: str
    disease: str
    severity: str
    transmission: str
    species_affected: str
    epicenter_lat: float
    epicenter_lng: float
    radius_km: float
    region_name: str
    detected_date: date
    expires_at: Optional[datetime] = None
    description: Optional[str] = None
    contingency_protocol: Optional[str] = None
    source_url: Optional[str] = None
    confirmed_cases: int = 0
    deaths_reported: int = 0
    spread_speed_km_day: Optional[float] = None
    spread_direction: Optional[str] = None
    is_active: bool = True
    resolved_at: Optional[datetime] = None
    created_by_id: Optional[uuid.UUID] = None
    created_at: datetime
    distance_km: Optional[float] = None  # calculated for querying user's farms

    model_config = {"from_attributes": True}


class OutbreakAlertUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    radius_km: Optional[float] = Field(default=None, gt=0, le=20000)
    description: Optional[str] = None
    contingency_protocol: Optional[str] = None
    confirmed_cases: Optional[int] = Field(default=None, ge=0)
    deaths_reported: Optional[int] = Field(default=None, ge=0)
    spread_speed_km_day: Optional[float] = Field(default=None, ge=0)
    spread_direction: Optional[str] = None
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None
