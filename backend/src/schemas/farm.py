import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FarmCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    owm_api_key: Optional[str] = Field(default=None, max_length=100)
    mqtt_broker: Optional[str] = Field(default=None, max_length=300)
    mqtt_user: Optional[str] = Field(default=None, max_length=100)
    mqtt_pass: Optional[str] = Field(default=None, max_length=200)


class FarmUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    owm_api_key: Optional[str] = Field(default=None, max_length=100)
    mqtt_broker: Optional[str] = Field(default=None, max_length=300)
    mqtt_user: Optional[str] = Field(default=None, max_length=100)
    mqtt_pass: Optional[str] = Field(default=None, max_length=200)


class FarmReadPublic(BaseModel):
    """Safe schema — no secrets exposed."""
    id: uuid.UUID
    name: str
    lat: Optional[float]
    lng: Optional[float]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FarmRead(BaseModel):
    """Admin schema — includes MQTT/OWM config (only for create/update responses)."""
    id: uuid.UUID
    name: str
    lat: Optional[float]
    lng: Optional[float]
    owm_api_key: Optional[str]
    mqtt_broker: Optional[str]
    mqtt_user: Optional[str]
    mqtt_pass: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
