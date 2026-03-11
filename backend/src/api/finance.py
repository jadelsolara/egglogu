import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.database import get_db
from src.models.auth import User
from src.schemas.finance import (
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    IncomeCreate,
    IncomeRead,
    IncomeUpdate,
    ReceivableCreate,
    ReceivableRead,
    ReceivableUpdate,
)
from src.services.finance_service import FinanceService

router = APIRouter(tags=["finance"])


def _svc(db: AsyncSession, user: User) -> FinanceService:
    return FinanceService(db, user.organization_id, user.id)


# --- Income ---


@router.get("/income", response_model=list[IncomeRead])
async def list_income(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).list_income(page=page, size=size)


@router.get("/income/{item_id}", response_model=IncomeRead)
async def get_income(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).get_income(item_id)


@router.post("/income", response_model=IncomeRead, status_code=status.HTTP_201_CREATED)
async def create_income(
    data: IncomeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).create_income(data)


@router.put("/income/{item_id}", response_model=IncomeRead)
async def update_income(
    item_id: uuid.UUID,
    data: IncomeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).update_income(item_id, data)


@router.delete("/income/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _svc(db, user).delete_income(item_id)


# --- Expenses ---


@router.get("/expenses", response_model=list[ExpenseRead])
async def list_expenses(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).list_expenses(page=page, size=size)


@router.get("/expenses/{item_id}", response_model=ExpenseRead)
async def get_expense(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).get_expense(item_id)


@router.post(
    "/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED
)
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).create_expense(data)


@router.put("/expenses/{item_id}", response_model=ExpenseRead)
async def update_expense(
    item_id: uuid.UUID,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).update_expense(item_id, data)


@router.delete("/expenses/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _svc(db, user).delete_expense(item_id)


# --- Receivables ---


@router.get("/receivables", response_model=list[ReceivableRead])
async def list_receivables(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).list_receivables(page=page, size=size)


@router.get("/receivables/{item_id}", response_model=ReceivableRead)
async def get_receivable(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).get_receivable(item_id)


@router.post(
    "/receivables", response_model=ReceivableRead, status_code=status.HTTP_201_CREATED
)
async def create_receivable(
    data: ReceivableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).create_receivable(data)


@router.put("/receivables/{item_id}", response_model=ReceivableRead)
async def update_receivable(
    item_id: uuid.UUID,
    data: ReceivableUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _svc(db, user).update_receivable(item_id, data)


@router.delete("/receivables/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receivable(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _svc(db, user).delete_receivable(item_id)
