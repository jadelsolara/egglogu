import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class WorkflowRuleCreate(BaseModel):
    farm_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    preset: Optional[str] = Field(default=None, max_length=50)
    trigger_type: str = Field(pattern=r"^(data_change|schedule|threshold)$")
    conditions: dict
    actions: dict
    is_active: bool = True
    cooldown_minutes: int = Field(default=60, ge=1, le=10080)


class WorkflowRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    trigger_type: Optional[str] = Field(
        default=None, pattern=r"^(data_change|schedule|threshold)$"
    )
    conditions: Optional[dict] = None
    actions: Optional[dict] = None
    is_active: Optional[bool] = None
    cooldown_minutes: Optional[int] = Field(default=None, ge=1, le=10080)


class WorkflowRuleRead(BaseModel):
    id: uuid.UUID
    farm_id: uuid.UUID
    created_by: uuid.UUID
    name: str
    description: Optional[str]
    preset: Optional[str]
    trigger_type: str
    conditions: dict
    actions: dict
    is_active: bool
    cooldown_minutes: int
    last_triggered_at: Optional[datetime]
    execution_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowExecutionRead(BaseModel):
    id: uuid.UUID
    rule_id: uuid.UUID
    farm_id: uuid.UUID
    triggered_by: str
    conditions_matched: Optional[dict]
    actions_executed: Optional[dict]
    status: str
    error: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkflowTestRequest(BaseModel):
    farm_id: uuid.UUID
    conditions: dict
    actions: dict
