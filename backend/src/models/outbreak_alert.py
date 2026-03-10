"""Global outbreak alert model — geo-targeted alerts by radius."""

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, Enum as SAEnum, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin


class OutbreakSeverity(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class TransmissionType(str, enum.Enum):
    airborne = "airborne"
    contact = "contact"
    vector = "vector"          # mosquitoes, ticks, etc.
    waterborne = "waterborne"
    fomite = "fomite"          # contaminated objects/surfaces
    unknown = "unknown"


class OutbreakAlert(TimestampMixin, Base):
    """Global outbreak alert broadcast — geo-targeted by radius from epicenter.

    Only superadmin can create. Farms within radius_km of (epicenter_lat, epicenter_lng)
    see the alert. Distance calculated via Haversine formula.
    """

    __tablename__ = "outbreak_alerts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # What
    title: Mapped[str] = mapped_column(String(300))
    disease: Mapped[str] = mapped_column(String(200), index=True)
    severity: Mapped[OutbreakSeverity] = mapped_column(
        SAEnum(OutbreakSeverity), default=OutbreakSeverity.moderate
    )
    transmission: Mapped[TransmissionType] = mapped_column(
        SAEnum(TransmissionType), default=TransmissionType.unknown
    )
    species_affected: Mapped[str] = mapped_column(
        String(300), default="poultry"
    )  # comma-separated: "poultry,waterfowl,swine"

    # Where — epicenter + radius
    epicenter_lat: Mapped[float] = mapped_column(Float)
    epicenter_lng: Mapped[float] = mapped_column(Float)
    radius_km: Mapped[float] = mapped_column(Float, default=100.0)
    region_name: Mapped[str] = mapped_column(String(200))  # human-readable: "Central Chile", "Iowa, USA"

    # When
    detected_date: Mapped[date] = mapped_column(Date)
    expires_at: Mapped[Optional[datetime]] = mapped_column(default=None)

    # Details
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)
    contingency_protocol: Mapped[Optional[str]] = mapped_column(Text, default=None)
    source_url: Mapped[Optional[str]] = mapped_column(String(500), default=None)
    confirmed_cases: Mapped[int] = mapped_column(Integer, default=0)
    deaths_reported: Mapped[int] = mapped_column(Integer, default=0)

    # Propagation metrics
    spread_speed_km_day: Mapped[Optional[float]] = mapped_column(Float, default=None)
    spread_direction: Mapped[Optional[str]] = mapped_column(
        String(50), default=None
    )  # "N", "NE", "S", etc.

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(default=None)

    # Superadmin who created it
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(default=None)
