import uuid
from typing import Optional

from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class Farm(TimestampMixin, TenantMixin, Base):
    __tablename__ = "farms"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    lat: Mapped[Optional[float]] = mapped_column(Float, default=None)
    lng: Mapped[Optional[float]] = mapped_column(Float, default=None)
    owm_api_key: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    mqtt_broker: Mapped[Optional[str]] = mapped_column(String(300), default=None)
    mqtt_user: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    mqtt_pass: Mapped[Optional[str]] = mapped_column(String(100), default=None)

    flocks: Mapped[list["Flock"]] = relationship(back_populates="farm")  # noqa: F821
