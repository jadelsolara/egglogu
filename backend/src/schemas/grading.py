import uuid
from datetime import date
from typing import Optional
from pydantic import BaseModel, ConfigDict


class GradingSessionCreate(BaseModel):
    flock_id: uuid.UUID
    date: date
    total_graded: int = 0
    grade_aa: int = 0
    grade_a: int = 0
    grade_b: int = 0
    rejected: int = 0
    dirty: int = 0
    cracked: int = 0
    avg_weight_g: Optional[float] = None
    shell_strength: Optional[float] = None
    haugh_unit: Optional[float] = None
    yolk_color_score: Optional[int] = None
    grader_id: Optional[str] = None
    machine_id: Optional[str] = None
    notes: Optional[str] = None

class GradingSessionUpdate(BaseModel):
    total_graded: Optional[int] = None
    grade_aa: Optional[int] = None
    grade_a: Optional[int] = None
    grade_b: Optional[int] = None
    rejected: Optional[int] = None
    dirty: Optional[int] = None
    cracked: Optional[int] = None
    avg_weight_g: Optional[float] = None
    shell_strength: Optional[float] = None
    haugh_unit: Optional[float] = None
    yolk_color_score: Optional[int] = None
    grader_id: Optional[str] = None
    machine_id: Optional[str] = None
    notes: Optional[str] = None

class GradingSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    flock_id: uuid.UUID
    date: date
    total_graded: int
    grade_aa: int
    grade_a: int
    grade_b: int
    rejected: int
    dirty: int
    cracked: int
    avg_weight_g: Optional[float]
    shell_strength: Optional[float]
    haugh_unit: Optional[float]
    yolk_color_score: Optional[int]
    grader_id: Optional[str]
    machine_id: Optional[str]
    notes: Optional[str]
