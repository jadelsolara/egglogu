import uuid
from datetime import date
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Cost Center ──
class CostCenterCreate(BaseModel):
    name: str
    code: str
    center_type: str = "flock"
    farm_id: Optional[uuid.UUID] = None
    flock_id: Optional[uuid.UUID] = None
    parent_center_id: Optional[uuid.UUID] = None
    budget_monthly: Optional[float] = None
    notes: Optional[str] = None

class CostCenterUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    center_type: Optional[str] = None
    farm_id: Optional[uuid.UUID] = None
    flock_id: Optional[uuid.UUID] = None
    parent_center_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    budget_monthly: Optional[float] = None
    notes: Optional[str] = None

class CostCenterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    code: str
    center_type: str
    farm_id: Optional[uuid.UUID]
    flock_id: Optional[uuid.UUID]
    parent_center_id: Optional[uuid.UUID]
    is_active: bool
    budget_monthly: Optional[float]
    notes: Optional[str]

# ── Cost Allocation ──
class CostAllocationCreate(BaseModel):
    cost_center_id: uuid.UUID
    date: date
    category: str
    description: str
    amount: float
    allocation_method: str = "direct"
    allocation_pct: float = 100.0
    source_expense_id: Optional[uuid.UUID] = None
    source_po_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

class CostAllocationUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    allocation_method: Optional[str] = None
    allocation_pct: Optional[float] = None
    notes: Optional[str] = None

class CostAllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cost_center_id: uuid.UUID
    date: date
    category: str
    description: str
    amount: float
    allocation_method: str
    allocation_pct: float
    source_expense_id: Optional[uuid.UUID]
    source_po_id: Optional[uuid.UUID]
    notes: Optional[str]

# ── P&L Snapshot ──
class ProfitLossSnapshotCreate(BaseModel):
    cost_center_id: uuid.UUID
    period_start: date
    period_end: date
    total_revenue: float = 0.0
    total_cost: float = 0.0
    eggs_produced: Optional[int] = None
    eggs_sold: Optional[int] = None
    notes: Optional[str] = None

class ProfitLossSnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cost_center_id: uuid.UUID
    period_start: date
    period_end: date
    total_revenue: float
    total_cost: float
    gross_profit: float
    margin_pct: float
    cost_breakdown: Optional[dict]
    revenue_breakdown: Optional[dict]
    eggs_produced: Optional[int]
    eggs_sold: Optional[int]
    cost_per_egg: Optional[float]
    cost_per_dozen: Optional[float]
    notes: Optional[str]
