import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    String, Float, Integer, Date, Enum,
    ForeignKey, Text, Boolean
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class POStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    ordered = "ordered"
    partially_received = "partially_received"
    received = "received"
    cancelled = "cancelled"


class POCategory(str, enum.Enum):
    feed = "feed"
    medication = "medication"
    packaging = "packaging"
    equipment = "equipment"
    pullets = "pullets"
    cleaning = "cleaning"
    other = "other"


class Supplier(TimestampMixin, TenantMixin, Base):
    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    phone: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    email: Mapped[Optional[str]] = mapped_column(String(320), default=None)
    address: Mapped[Optional[str]] = mapped_column(Text, default=None)
    tax_id: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    category: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="supplier")


class PurchaseOrder(TimestampMixin, TenantMixin, Base):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    po_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[POStatus] = mapped_column(Enum(POStatus), default=POStatus.draft)
    category: Mapped[POCategory] = mapped_column(Enum(POCategory), default=POCategory.other)
    order_date: Mapped[date] = mapped_column(Date)
    expected_delivery: Mapped[Optional[date]] = mapped_column(Date, default=None)
    actual_delivery: Mapped[Optional[date]] = mapped_column(Date, default=None)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    tax: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )

    supplier: Mapped["Supplier"] = relationship(back_populates="purchase_orders")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        back_populates="purchase_order", cascade="all, delete-orphan"
    )


class PurchaseOrderItem(TimestampMixin, Base):
    __tablename__ = "purchase_order_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(String(300))
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(50), default="kg")
    unit_price: Mapped[float] = mapped_column(Float)
    total_price: Mapped[float] = mapped_column(Float)
    received_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="items")
