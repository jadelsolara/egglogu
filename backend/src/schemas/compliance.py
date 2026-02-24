import uuid
from datetime import date
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CertificationCreate(BaseModel):
    framework: str
    name: str
    certificate_number: Optional[str] = None
    issued_date: Optional[date] = None
    expiry_date: Optional[date] = None
    issuing_authority: Optional[str] = None
    notes: Optional[str] = None
    document_ref: Optional[str] = None

class CertificationUpdate(BaseModel):
    name: Optional[str] = None
    certificate_number: Optional[str] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    document_ref: Optional[str] = None

class CertificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    framework: str
    name: str
    certificate_number: Optional[str]
    issued_date: Optional[date]
    expiry_date: Optional[date]
    status: str
    issuing_authority: Optional[str]
    notes: Optional[str]
    document_ref: Optional[str]

class InspectionCreate(BaseModel):
    framework: str
    inspection_type: str
    scheduled_date: date
    inspector_name: Optional[str] = None
    notes: Optional[str] = None

class InspectionUpdate(BaseModel):
    status: Optional[str] = None
    completed_date: Optional[date] = None
    findings: Optional[str] = None
    corrective_actions: Optional[str] = None
    score: Optional[str] = None
    next_inspection: Optional[date] = None
    notes: Optional[str] = None

class InspectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    framework: str
    inspection_type: str
    scheduled_date: date
    completed_date: Optional[date]
    inspector_name: Optional[str]
    status: str
    findings: Optional[str]
    corrective_actions: Optional[str]
    score: Optional[str]
    next_inspection: Optional[date]
    notes: Optional[str]

class SalmonellaTestCreate(BaseModel):
    flock_id: uuid.UUID
    sample_date: date
    lab_name: Optional[str] = None
    sample_type: str = "environment"
    notes: Optional[str] = None

class SalmonellaTestUpdate(BaseModel):
    result: Optional[str] = None
    result_date: Optional[date] = None
    serotype: Optional[str] = None
    notes: Optional[str] = None

class SalmonellaTestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    flock_id: uuid.UUID
    sample_date: date
    lab_name: Optional[str]
    sample_type: str
    result: str
    result_date: Optional[date]
    serotype: Optional[str]
    notes: Optional[str]
