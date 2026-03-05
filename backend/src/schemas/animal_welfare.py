import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class WelfareAssessmentCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    plumage_score: int = Field(ge=1, le=5)
    mobility_score: int = Field(ge=1, le=5)
    behavior_score: int = Field(ge=1, le=5)
    space_per_bird_sqm: Optional[float] = Field(default=None, ge=0, le=100)
    nest_access: Optional[bool] = None
    perch_access: Optional[bool] = None
    lighting_hours: Optional[float] = Field(default=None, ge=0, le=24)
    litter_condition_score: Optional[int] = Field(default=None, ge=1, le=5)
    foot_pad_score: Optional[int] = Field(default=None, ge=1, le=5)
    feather_pecking_observed: bool = False
    mortality_today: int = Field(default=0, ge=0, le=1_000_000)
    notes: Optional[str] = Field(default=None, max_length=2000)
    share_anonymized: bool = True

    @model_validator(mode="after")
    def compute_overall(self):
        self.overall_score = round(
            (self.plumage_score + self.mobility_score + self.behavior_score) / 3, 2
        )
        return self

    overall_score: Optional[float] = None


class WelfareAssessmentUpdate(BaseModel):
    plumage_score: Optional[int] = Field(default=None, ge=1, le=5)
    mobility_score: Optional[int] = Field(default=None, ge=1, le=5)
    behavior_score: Optional[int] = Field(default=None, ge=1, le=5)
    space_per_bird_sqm: Optional[float] = Field(default=None, ge=0, le=100)
    nest_access: Optional[bool] = None
    perch_access: Optional[bool] = None
    lighting_hours: Optional[float] = Field(default=None, ge=0, le=24)
    litter_condition_score: Optional[int] = Field(default=None, ge=1, le=5)
    foot_pad_score: Optional[int] = Field(default=None, ge=1, le=5)
    feather_pecking_observed: Optional[bool] = None
    mortality_today: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    notes: Optional[str] = Field(default=None, max_length=2000)
    share_anonymized: Optional[bool] = None
    overall_score: Optional[float] = None


class WelfareAssessmentRead(BaseModel):
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    plumage_score: int
    mobility_score: int
    behavior_score: int
    space_per_bird_sqm: Optional[float]
    nest_access: Optional[bool]
    perch_access: Optional[bool]
    lighting_hours: Optional[float]
    litter_condition_score: Optional[int]
    foot_pad_score: Optional[int]
    feather_pecking_observed: bool
    mortality_today: int
    overall_score: float
    notes: Optional[str]
    share_anonymized: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WelfareStats(BaseModel):
    total_assessments: int
    avg_overall_score: Optional[float]
    avg_plumage: Optional[float]
    avg_mobility: Optional[float]
    avg_behavior: Optional[float]
    feather_pecking_rate: Optional[float]
    latest_date: Optional[date]
