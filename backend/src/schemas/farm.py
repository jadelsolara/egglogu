import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FarmCreate(BaseModel):
    name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    owm_api_key: Optional[str] = None
    mqtt_broker: Optional[str] = None
    mqtt_user: Optional[str] = None
    mqtt_pass: Optional[str] = None


class FarmUpdate(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    owm_api_key: Optional[str] = None
    mqtt_broker: Optional[str] = None
    mqtt_user: Optional[str] = None
    mqtt_pass: Optional[str] = None


class FarmRead(BaseModel):
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
