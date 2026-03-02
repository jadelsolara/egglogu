import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReportScheduleCreate(BaseModel):
    farm_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    template: str = Field(pattern=r"^(production|financial|health|feed|kpi)$")
    frequency: str = Field(pattern=r"^(daily|weekly|monthly)$")
    recipients: Optional[str] = Field(default=None, max_length=2000)
    is_active: bool = True
    params: Optional[dict] = None


class ReportScheduleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    template: Optional[str] = Field(
        default=None, pattern=r"^(production|financial|health|feed|kpi)$"
    )
    frequency: Optional[str] = Field(
        default=None, pattern=r"^(daily|weekly|monthly)$"
    )
    recipients: Optional[str] = Field(default=None, max_length=2000)
    is_active: Optional[bool] = None
    params: Optional[dict] = None


class ReportScheduleRead(BaseModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    created_by: uuid.UUID
    name: str
    template: str
    frequency: str
    recipients: Optional[str]
    is_active: bool
    params: Optional[dict]
    last_sent_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportExecutionRead(BaseModel):
    id: uuid.UUID
    schedule_id: Optional[uuid.UUID]
    farm_id: uuid.UUID
    template: str
    triggered_by: uuid.UUID
    status: str
    recipients_sent: Optional[str]
    error: Optional[str]
    result_summary: Optional[dict]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportGenerateRequest(BaseModel):
    farm_id: uuid.UUID
    template: str = Field(pattern=r"^(production|financial|health|feed|kpi)$")
    send_email: bool = False
    recipients: Optional[str] = Field(default=None, max_length=2000)
