import enum
import uuid
from datetime import date
from typing import Optional

from sqlalchemy import (
    String, Date, Enum, ForeignKey, Text, JSON
)
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base
from src.models.base import TimestampMixin, TenantMixin


class ComplianceFramework(str, enum.Enum):
    senasica = "senasica"      # Mexico
    ica = "ica"                # Colombia
    eu_regulation = "eu"       # European Union
    usda = "usda"              # United States
    haccp = "haccp"            # Universal
    organic = "organic"        # Organic certification
    free_range = "free_range"  # Free-range certification
    custom = "custom"


class InspectionStatus(str, enum.Enum):
    scheduled = "scheduled"
    in_progress = "in_progress"
    passed = "passed"
    failed = "failed"
    remediation = "remediation"


class ComplianceCertification(TimestampMixin, TenantMixin, Base):
    __tablename__ = "compliance_certifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    framework: Mapped[ComplianceFramework] = mapped_column(
        Enum(ComplianceFramework), index=True
    )
    name: Mapped[str] = mapped_column(String(300))
    certificate_number: Mapped[Optional[str]] = mapped_column(
        String(100), default=None
    )
    issued_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, index=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="active")
    issuing_authority: Mapped[Optional[str]] = mapped_column(
        String(200), default=None
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
    document_ref: Mapped[Optional[str]] = mapped_column(
        String(500), default=None
    )


class ComplianceInspection(TimestampMixin, TenantMixin, Base):
    __tablename__ = "compliance_inspections"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    framework: Mapped[ComplianceFramework] = mapped_column(
        Enum(ComplianceFramework), index=True
    )
    inspection_type: Mapped[str] = mapped_column(String(100))
    scheduled_date: Mapped[date] = mapped_column(Date, index=True)
    completed_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    inspector_name: Mapped[Optional[str]] = mapped_column(
        String(200), default=None
    )
    status: Mapped[InspectionStatus] = mapped_column(
        Enum(InspectionStatus), default=InspectionStatus.scheduled
    )
    findings: Mapped[Optional[str]] = mapped_column(Text, default=None)
    corrective_actions: Mapped[Optional[str]] = mapped_column(
        Text, default=None
    )
    score: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    next_inspection: Mapped[Optional[date]] = mapped_column(Date, default=None)
    checklist_json: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)


class SalmonellaTest(TimestampMixin, TenantMixin, Base):
    __tablename__ = "salmonella_tests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flock_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flocks.id", ondelete="CASCADE"), index=True
    )
    sample_date: Mapped[date] = mapped_column(Date, index=True)
    lab_name: Mapped[Optional[str]] = mapped_column(String(200), default=None)
    sample_type: Mapped[str] = mapped_column(String(100), default="environment")
    result: Mapped[str] = mapped_column(String(20), default="pending")
    result_date: Mapped[Optional[date]] = mapped_column(Date, default=None)
    serotype: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, default=None)
