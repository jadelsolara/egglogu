import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.core.exceptions import NotFoundError
from src.database import get_db
from src.models.auth import User
from src.models.finance import Expense, Income, Receivable
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

router = APIRouter(tags=["finance"])

# --- Income ---


@router.get("/income", response_model=list[IncomeRead])
async def list_income(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(Income).where(Income.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/income/{item_id}", response_model=IncomeRead)
async def get_income(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Income).where(
            Income.id == item_id, Income.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Income not found")
    return item


@router.post("/income", response_model=IncomeRead, status_code=status.HTTP_201_CREATED)
async def create_income(
    data: IncomeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Income(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/income/{item_id}", response_model=IncomeRead)
async def update_income(
    item_id: uuid.UUID,
    data: IncomeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Income).where(
            Income.id == item_id, Income.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Income not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/income/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_income(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Income).where(
            Income.id == item_id, Income.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Income not found")
    await db.delete(item)


# --- Expenses ---


@router.get("/expenses", response_model=list[ExpenseRead])
async def list_expenses(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(Expense).where(Expense.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/expenses/{item_id}", response_model=ExpenseRead)
async def get_expense(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Expense).where(
            Expense.id == item_id, Expense.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Expense not found")
    return item


@router.post(
    "/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED
)
async def create_expense(
    data: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Expense(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/expenses/{item_id}", response_model=ExpenseRead)
async def update_expense(
    item_id: uuid.UUID,
    data: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Expense).where(
            Expense.id == item_id, Expense.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Expense not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/expenses/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Expense).where(
            Expense.id == item_id, Expense.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Expense not found")
    await db.delete(item)


# --- Receivables ---


@router.get("/receivables", response_model=list[ReceivableRead])
async def list_receivables(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(Receivable).where(Receivable.organization_id == user.organization_id).offset((page - 1) * size).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/receivables/{item_id}", response_model=ReceivableRead)
async def get_receivable(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == item_id, Receivable.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Receivable not found")
    return item


@router.post(
    "/receivables", response_model=ReceivableRead, status_code=status.HTTP_201_CREATED
)
async def create_receivable(
    data: ReceivableCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Receivable(**data.model_dump(), organization_id=user.organization_id)
    db.add(item)
    await db.flush()
    return item


@router.put("/receivables/{item_id}", response_model=ReceivableRead)
async def update_receivable(
    item_id: uuid.UUID,
    data: ReceivableUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == item_id, Receivable.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Receivable not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.flush()
    return item


@router.delete("/receivables/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receivable(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Receivable).where(
            Receivable.id == item_id, Receivable.organization_id == user.organization_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Receivable not found")
    await db.delete(item)
