import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class TraceabilityBatch(TimestampMixin, TenantMixin, Base):
    __tablename__ = "traceability_batches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    batch_code: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    flock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flocks.id", ondelete="CASCADE"), index=True
    )
    house: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    rack_number: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    box_count: Mapped[int] = mapped_column(Integer, default=0)
    eggs_per_box: Mapped[int] = mapped_column(Integer, default=30)
    egg_type: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    qr_code: Mapped[Optional[str]] = mapped_column(String(500), default=None)
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), default=None
    )
    delivery_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)

    # Relationships for public trace lookup
    flock = relationship("Flock", lazy="selectin")
    client = relationship("Client", lazy="selectin")
