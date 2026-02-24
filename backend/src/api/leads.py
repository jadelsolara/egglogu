from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import get_db
from src.models.lead import Lead
from src.core.email_archive import archive_lead

router = APIRouter(prefix="/leads", tags=["leads"])


class LeadCreate(BaseModel):
    email: EmailStr
    farm_name: Optional[str] = None
    country: Optional[str] = None
    operation_size: Optional[str] = None
    primary_need: Optional[str] = None
    source: Optional[str] = None


@router.post("/", status_code=status.HTTP_201_CREATED)
async def capture_lead(data: LeadCreate, db: AsyncSession = Depends(get_db)):
    lead = Lead(**data.model_dump())
    db.add(lead)
    await db.flush()
    archive_lead(data.email, data.model_dump())
    return {"ok": True}
