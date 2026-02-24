import uuid
from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


class Lead(TimestampMixin, Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), index=True)
    farm_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    country: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    operation_size: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    primary_need: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    source: Mapped[Optional[str]] = mapped_column(String(50), default=None)
