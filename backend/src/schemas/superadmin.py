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
