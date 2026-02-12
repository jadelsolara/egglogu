import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class ProductionPlan(TimestampMixin, TenantMixin, Base):
    __tablename__ = "production_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    target_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("clients.id"), default=None)
    eggs_needed: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    flock_allocations_json: Mapped[Optional[str]] = mapped_column(Text, default=None)
