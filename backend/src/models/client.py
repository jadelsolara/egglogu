import uuid
from typing import Optional

from sqlalchemy import String, Float, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class Client(TimestampMixin, TenantMixin, Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    email: Mapped[Optional[str]] = mapped_column(String(320), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    price_small: Mapped[Optional[float]] = mapped_column(Float, default=None)
    price_medium: Mapped[Optional[float]] = mapped_column(Float, default=None)
    price_large: Mapped[Optional[float]] = mapped_column(Float, default=None)
    price_xl: Mapped[Optional[float]] = mapped_column(Float, default=None)

    incomes: Mapped[list["Income"]] = relationship(back_populates="client")  # noqa: F821
    receivables: Mapped[list["Receivable"]] = relationship(back_populates="client")  # noqa: F821
