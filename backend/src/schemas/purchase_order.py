import uuid
from datetime import date
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Supplier ──
class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    category: Optional[str] = None
    payment_terms_days: int = 30
    notes: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    category: Optional[str] = None
    payment_terms_days: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    contact_name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    tax_id: Optional[str]
    category: Optional[str]
    payment_terms_days: int
    is_active: bool
    notes: Optional[str]

# ── PO Item ──
class POItemCreate(BaseModel):
    description: str
    quantity: float
    unit: str = "kg"
    unit_price: float
    notes: Optional[str] = None

class POItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    description: str
    quantity: float
    unit: str
    unit_price: float
    total_price: float
    received_quantity: float
    notes: Optional[str]

# ── Purchase Order ──
class PurchaseOrderCreate(BaseModel):
    supplier_id: uuid.UUID
    category: str = "other"
    order_date: date
    expected_delivery: Optional[date] = None
    currency: str = "USD"
    notes: Optional[str] = None
    items: list[POItemCreate] = []

class PurchaseOrderUpdate(BaseModel):
    status: Optional[str] = None
    expected_delivery: Optional[date] = None
    actual_delivery: Optional[date] = None
    notes: Optional[str] = None

class PurchaseOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    po_number: str
    supplier_id: uuid.UUID
    status: str
    category: str
    order_date: date
    expected_delivery: Optional[date]
    actual_delivery: Optional[date]
    subtotal: float
    tax: float
    total: float
    currency: str
    notes: Optional[str]
    items: list[POItemRead] = []
