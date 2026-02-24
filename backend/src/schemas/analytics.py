import uuid
from typing import Optional

from pydantic import BaseModel


class CostBreakdown(BaseModel):
    acquisition: Optional[float] = None
    feed: Optional[float] = None
    health: Optional[float] = None
    direct_expenses: Optional[float] = None
    total: Optional[float] = None


class DataCompleteness(BaseModel):
    has_purchase_cost: bool = False
    has_feed_data: bool = False
    has_health_costs: bool = False
    has_direct_expenses: bool = False
    has_production_data: bool = False


class FlockMetrics(BaseModel):
    cost_per_egg: Optional[float] = None
    roi_per_bird: Optional[float] = None
    daily_cost_per_bird: Optional[float] = None


class FlockEconomics(BaseModel):
    flock_id: uuid.UUID
    flock_name: str
    current_count: int
    total_eggs: Optional[int] = None
    days_active: int
    costs: CostBreakdown
    metrics: FlockMetrics
    data_completeness: DataCompleteness


class OrgEconomicsSummary(BaseModel):
    total_eggs: Optional[int] = None
    weighted_avg_cost_per_egg: Optional[float] = None
    total_investment: Optional[float] = None
    total_costs: Optional[float] = None
    total_revenue: Optional[float] = None
    net_result: Optional[float] = None


class EconomicsResponse(BaseModel):
    flocks: list[FlockEconomics]
    org_summary: OrgEconomicsSummary
