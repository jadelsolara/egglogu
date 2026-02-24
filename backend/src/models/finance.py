import uuid
from datetime import date
from typing import Optional

from sqlalchemy import String, Float, Date, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class Income(TimestampMixin, TenantMixin, Base):
    __tablename__ = "incomes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    dozens: Mapped[float] = mapped_column(Float)
    egg_size: Mapped[Optional[str]] = mapped_column(String(20), default=None)
    unit_price: Mapped[float] = mapped_column(Float)
    total: Mapped[float] = mapped_column(Float)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    client: Mapped["Client"] = relationship(back_populates="incomes")  # noqa: F821


class Expense(TimestampMixin, TenantMixin, Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    amount: Mapped[float] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    flock_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("flocks.id", ondelete="SET NULL"), index=True, default=None
    )


class Receivable(TimestampMixin, TenantMixin, Base):
    __tablename__ = "receivables"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    client: Mapped["Client"] = relationship(back_populates="receivables")  # noqa: F821
