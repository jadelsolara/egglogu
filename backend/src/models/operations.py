import uuid
from datetime import date
from typing import Optional

from sqlalchemy import String, Float, Date, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class ChecklistItem(TimestampMixin, TenantMixin, Base):
    __tablename__ = "checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    label: Mapped[str] = mapped_column(String(300))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class LogbookEntry(TimestampMixin, TenantMixin, Base):
    __tablename__ = "logbook_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    date: Mapped[date] = mapped_column(Date)
    text: Mapped[str] = mapped_column(Text)


class Personnel(TimestampMixin, TenantMixin, Base):
    __tablename__ = "personnel"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    role_desc: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    phone: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    start_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    salary: Mapped[Optional[float]] = mapped_column(Float, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
