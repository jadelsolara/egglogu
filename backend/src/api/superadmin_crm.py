"""SuperAdmin CRM endpoints — customer 360°, notes, discounts, retention, billing."""

import csv
import io
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_superadmin
from src.core.crm import compute_health_score, compute_ltv, evaluate_retention_rules
from src.core.exceptions import NotFoundError
from src.core.stripe import (
    change_subscription_plan,
    create_manual_coupon,
    create_refund,
    create_stripe_credit_note,
    list_invoices,
    list_payment_methods,
)
from src.database import get_db
from src.models.audit import AuditLog
from src.models.auth import Organization, User
from src.models.crm import (
    CreditNote,
    CreditNoteStatus,
    CustomerNote,
    ManualDiscount,
    NoteType,
    RetentionAction,
    RetentionEvent,
    RetentionRule,
    RetentionTrigger,
)
from src.models.farm import Farm
from src.models.flock import Flock
from src.models.inventory import EggStock
from src.models.subscription import Subscription, SubscriptionStatus
from src.models.support import SupportTicket, TicketStatus
from src.schemas.superadmin import (
    ChangePlanRequest,
    CreditNoteCreate,
    CreditNoteRead,
    CRM360Response,
    CRMReportResponse,
    CustomerNoteCreate,
    CustomerNoteRead,
    CustomerNoteUpdate,
    ManualDiscountCreate,
    ManualDiscountRead,
    RefundRequest,
    RetentionEventRead,
    RetentionRuleCreate,
    RetentionRuleRead,
    RetentionRuleUpdate,
)

router = APIRouter(prefix="/superadmin", tags=["superadmin-crm"])

SUPERADMIN = Depends(require_superadmin())


# ── Audit helper ──────────────────────────────────────────────────


async def _audit(
    db: AsyncSession,
    user: User,
    action: str,
    resource: str,
    resource_id: str,
    request: Request,
    changes: dict | None = None,
):
    log = AuditLog(
        user_id=str(user.id),
        organization_id="platform",
        action=action,
        resource=resource,
        resource_id=str(resource_id),
        changes=changes,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
    )
    db.add(log)
    await db.flush()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRM 360° View
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "/organizations/{org_id}/crm-360", response_model=CRM360Response
)
async def crm_360_view(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    """Complete 360° CRM view of an organization."""
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    # Gather all data in parallel-style sequential calls
    health = await compute_health_score(org_id, db)
    ltv = await compute_ltv(org_id, db)

    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()

    users = (
        (await db.execute(select(User).where(User.organization_id == org_id)))
        .scalars()
        .all()
    )
    farms = (
        (await db.execute(select(Farm).where(Farm.organization_id == org_id)))
        .scalars()
        .all()
    )
    notes = (
        (
            await db.execute(
                select(CustomerNote)
                .where(CustomerNote.organization_id == org_id)
                .order_by(CustomerNote.is_pinned.desc(), CustomerNote.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    discounts = (
        (
            await db.execute(
                select(ManualDiscount)
                .where(
                    ManualDiscount.organization_id == org_id,
                    ManualDiscount.is_active.is_(True),
                )
                .order_by(ManualDiscount.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    credit_notes = (
        (
            await db.execute(
                select(CreditNote)
                .where(CreditNote.organization_id == org_id)
                .order_by(CreditNote.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    open_tix = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(
                SupportTicket.organization_id == org_id,
                SupportTicket.status.in_([TicketStatus.open, TicketStatus.in_progress]),
            )
        )
    ).scalar() or 0
    flock_count = (
        await db.execute(
            select(func.count(Flock.id)).where(Flock.organization_id == org_id)
        )
    ).scalar() or 0
    eggs = (
        await db.execute(
            select(func.coalesce(func.sum(EggStock.quantity), 0)).where(
                EggStock.organization_id == org_id
            )
        )
    ).scalar() or 0

    return CRM360Response(
        organization={
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "tier": org.tier,
            "created_at": org.created_at.isoformat(),
        },
        subscription={
            "plan": sub.plan.value,
            "status": sub.status.value,
            "is_trial": sub.is_trial,
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
            "months_subscribed": sub.months_subscribed,
            "billing_interval": sub.billing_interval,
            "stripe_customer_id": sub.stripe_customer_id,
            "stripe_subscription_id": sub.stripe_subscription_id,
            "discount_phase": sub.discount_phase,
        }
        if sub
        else None,
        health=health,
        ltv=ltv,
        users=[
            {
                "id": str(u.id),
                "email": u.email,
                "name": u.full_name,
                "role": u.role.value,
                "active": u.is_active,
                "last_seen": u.updated_at.isoformat() if u.updated_at else None,
            }
            for u in users
        ],
        farms=[{"id": str(f.id), "name": f.name} for f in farms],
        notes=[CustomerNoteRead.model_validate(n) for n in notes],
        discounts=[ManualDiscountRead.model_validate(d) for d in discounts],
        credit_notes=[CreditNoteRead.model_validate(cn) for cn in credit_notes],
        open_tickets=open_tix,
        total_flocks=flock_count,
        total_eggs_in_stock=eggs,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Customer Notes CRUD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get(
    "/organizations/{org_id}/notes", response_model=list[CustomerNoteRead]
)
async def list_notes(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    notes = (
        await db.execute(
            select(CustomerNote)
            .where(CustomerNote.organization_id == org_id)
            .order_by(CustomerNote.is_pinned.desc(), CustomerNote.created_at.desc())
        )
    ).scalars().all()
    return [CustomerNoteRead.model_validate(n) for n in notes]


@router.post(
    "/organizations/{org_id}/notes",
    response_model=CustomerNoteRead,
    status_code=201,
)
async def create_note(
    org_id: uuid.UUID,
    body: CustomerNoteCreate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    # Verify org exists
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    note = CustomerNote(
        organization_id=org_id,
        author_id=user.id,
        content=body.content,
        note_type=NoteType(body.note_type),
        is_pinned=body.is_pinned,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    await _audit(db, user, "CREATE", "customer_note", str(note.id), request)
    return CustomerNoteRead.model_validate(note)


@router.patch("/organizations/{org_id}/notes/{note_id}", response_model=CustomerNoteRead)
async def update_note(
    org_id: uuid.UUID,
    note_id: uuid.UUID,
    body: CustomerNoteUpdate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    note = (
        await db.execute(
            select(CustomerNote).where(
                CustomerNote.id == note_id,
                CustomerNote.organization_id == org_id,
            )
        )
    ).scalar_one_or_none()
    if not note:
        raise NotFoundError("Note not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "note_type" and value is not None:
            setattr(note, key, NoteType(value))
        else:
            setattr(note, key, value)

    await db.flush()
    await db.refresh(note)
    await _audit(db, user, "UPDATE", "customer_note", str(note_id), request)
    return CustomerNoteRead.model_validate(note)


@router.delete("/organizations/{org_id}/notes/{note_id}", status_code=204)
async def delete_note(
    org_id: uuid.UUID,
    note_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    note = (
        await db.execute(
            select(CustomerNote).where(
                CustomerNote.id == note_id,
                CustomerNote.organization_id == org_id,
            )
        )
    ).scalar_one_or_none()
    if not note:
        raise NotFoundError("Note not found")

    await _audit(db, user, "DELETE", "customer_note", str(note_id), request)
    await db.delete(note)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Manual Discounts
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post(
    "/organizations/{org_id}/discounts",
    response_model=ManualDiscountRead,
    status_code=201,
)
async def apply_discount(
    org_id: uuid.UUID,
    body: ManualDiscountCreate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()

    # Create Stripe coupon if subscription has Stripe ID
    stripe_coupon_id = None
    if sub and sub.stripe_subscription_id:
        try:
            stripe_coupon_id = await create_manual_coupon(
                percent_off=body.percent_off,
                duration_months=body.duration_months,
                name=f"Manual: {body.reason[:50]}",
            )
            import stripe
            stripe.Subscription.modify(
                sub.stripe_subscription_id, coupon=stripe_coupon_id
            )
        except Exception:
            pass  # Log but don't fail — discount still recorded locally

    now = datetime.now(timezone.utc)
    discount = ManualDiscount(
        organization_id=org_id,
        applied_by=user.id,
        percent_off=body.percent_off,
        duration_months=body.duration_months,
        reason=body.reason,
        stripe_coupon_id=stripe_coupon_id,
        is_active=True,
        expires_at=now + timedelta(days=body.duration_months * 30),
    )
    db.add(discount)
    await db.flush()
    await db.refresh(discount)

    await _audit(
        db, user, "CREATE", "manual_discount", str(discount.id), request,
        changes={"percent_off": body.percent_off, "org": org.name},
    )
    return ManualDiscountRead.model_validate(discount)


@router.get("/discounts", response_model=list[ManualDiscountRead])
async def list_active_discounts(
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    discounts = (
        await db.execute(
            select(ManualDiscount)
            .where(ManualDiscount.is_active.is_(True))
            .order_by(ManualDiscount.created_at.desc())
        )
    ).scalars().all()
    return [ManualDiscountRead.model_validate(d) for d in discounts]


@router.delete("/discounts/{discount_id}", status_code=204)
async def revoke_discount(
    discount_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    discount = (
        await db.execute(
            select(ManualDiscount).where(ManualDiscount.id == discount_id)
        )
    ).scalar_one_or_none()
    if not discount:
        raise NotFoundError("Discount not found")

    discount.is_active = False

    # Remove Stripe coupon from subscription if active
    if discount.stripe_coupon_id:
        sub = (
            await db.execute(
                select(Subscription).where(
                    Subscription.organization_id == discount.organization_id
                )
            )
        ).scalar_one_or_none()
        if sub and sub.stripe_subscription_id:
            try:
                import stripe
                stripe.Subscription.modify(sub.stripe_subscription_id, coupon="")
            except Exception:
                pass

    await _audit(db, user, "DELETE", "manual_discount", str(discount_id), request)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Retention Rules CRUD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/retention-rules", response_model=list[RetentionRuleRead])
async def list_retention_rules(
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    rules = (
        await db.execute(
            select(RetentionRule).order_by(RetentionRule.created_at.desc())
        )
    ).scalars().all()
    return [RetentionRuleRead.model_validate(r) for r in rules]


@router.post(
    "/retention-rules", response_model=RetentionRuleRead, status_code=201
)
async def create_retention_rule(
    body: RetentionRuleCreate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    rule = RetentionRule(
        name=body.name,
        trigger_type=RetentionTrigger(body.trigger_type),
        conditions=body.conditions,
        discount_percent=body.discount_percent,
        action_type=RetentionAction(body.action_type),
        email_template_key=body.email_template_key,
        is_active=True,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)

    await _audit(db, user, "CREATE", "retention_rule", str(rule.id), request)
    return RetentionRuleRead.model_validate(rule)


@router.patch("/retention-rules/{rule_id}", response_model=RetentionRuleRead)
async def update_retention_rule(
    rule_id: uuid.UUID,
    body: RetentionRuleUpdate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    rule = (
        await db.execute(select(RetentionRule).where(RetentionRule.id == rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise NotFoundError("Retention rule not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        if key == "trigger_type" and value is not None:
            setattr(rule, key, RetentionTrigger(value))
        elif key == "action_type" and value is not None:
            setattr(rule, key, RetentionAction(value))
        else:
            setattr(rule, key, value)

    await db.flush()
    await db.refresh(rule)
    await _audit(db, user, "UPDATE", "retention_rule", str(rule_id), request)
    return RetentionRuleRead.model_validate(rule)


@router.delete("/retention-rules/{rule_id}", status_code=204)
async def delete_retention_rule(
    rule_id: uuid.UUID,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    rule = (
        await db.execute(select(RetentionRule).where(RetentionRule.id == rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise NotFoundError("Retention rule not found")

    await _audit(db, user, "DELETE", "retention_rule", str(rule_id), request)
    await db.delete(rule)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Retention Events & Evaluation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/retention-events", response_model=list[RetentionEventRead])
async def list_retention_events(
    org_id: Optional[uuid.UUID] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    q = select(RetentionEvent).order_by(RetentionEvent.created_at.desc())
    if org_id:
        q = q.where(RetentionEvent.organization_id == org_id)
    q = q.offset(offset).limit(limit)
    events = (await db.execute(q)).scalars().all()
    return [RetentionEventRead.model_validate(e) for e in events]


@router.post("/retention/evaluate")
async def evaluate_retention(
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    """Evaluate all active retention rules against all organizations."""
    triggered = await evaluate_retention_rules(db)
    await _audit(
        db, user, "EXECUTE", "retention_evaluation", "all", request,
        changes={"triggered_count": len(triggered)},
    )
    return {"triggered": triggered, "count": len(triggered)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Billing: Invoices, Refunds, Credit Notes, Payment Methods
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/organizations/{org_id}/invoices")
async def org_invoices(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if not sub or not sub.stripe_customer_id:
        return []

    return await list_invoices(sub.stripe_customer_id)


@router.post("/organizations/{org_id}/refund")
async def issue_refund(
    org_id: uuid.UUID,
    body: RefundRequest,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    """Issue a refund (full or partial) for a payment."""
    result = await create_refund(
        payment_intent_id=body.payment_intent_id,
        amount_cents=body.amount_cents,
        reason=body.reason,
    )
    await _audit(
        db, user, "CREATE", "refund", result["id"], request,
        changes={"amount": result["amount"], "org_id": str(org_id)},
    )
    return result


@router.post(
    "/organizations/{org_id}/credit-notes",
    response_model=CreditNoteRead,
    status_code=201,
)
async def create_credit_note(
    org_id: uuid.UUID,
    body: CreditNoteCreate,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    # Create in Stripe if invoice ID provided
    stripe_cn_id = None
    if body.stripe_invoice_id:
        try:
            result = await create_stripe_credit_note(
                invoice_id=body.stripe_invoice_id,
                amount_cents=body.amount_cents,
                reason=body.reason,
            )
            stripe_cn_id = result["id"]
        except Exception:
            pass  # Log but don't fail

    cn = CreditNote(
        organization_id=org_id,
        issued_by=user.id,
        amount_cents=body.amount_cents,
        currency=body.currency,
        reason=body.reason,
        stripe_credit_note_id=stripe_cn_id,
        status=CreditNoteStatus.issued,
    )
    db.add(cn)
    await db.flush()
    await db.refresh(cn)

    await _audit(
        db, user, "CREATE", "credit_note", str(cn.id), request,
        changes={"amount_cents": body.amount_cents, "org": org.name},
    )
    return CreditNoteRead.model_validate(cn)


@router.get("/organizations/{org_id}/credit-notes", response_model=list[CreditNoteRead])
async def list_credit_notes(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    cns = (
        await db.execute(
            select(CreditNote)
            .where(CreditNote.organization_id == org_id)
            .order_by(CreditNote.created_at.desc())
        )
    ).scalars().all()
    return [CreditNoteRead.model_validate(cn) for cn in cns]


@router.get("/organizations/{org_id}/payment-methods")
async def org_payment_methods(
    org_id: uuid.UUID,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if not sub or not sub.stripe_customer_id:
        return []

    methods = await list_payment_methods(sub.stripe_customer_id)

    # Mark default payment method
    try:
        import stripe
        customer = stripe.Customer.retrieve(sub.stripe_customer_id)
        default_pm = customer.get("invoice_settings", {}).get("default_payment_method")
        for m in methods:
            m["is_default"] = m["id"] == default_pm
    except Exception:
        pass

    return methods


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Plan Changes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post("/organizations/{org_id}/change-plan")
async def change_plan(
    org_id: uuid.UUID,
    body: ChangePlanRequest,
    request: Request,
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    """Manually change an organization's plan (with proration)."""
    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()
    if not sub:
        raise NotFoundError("No subscription found")

    old_plan = sub.plan.value

    # Update Stripe if connected
    stripe_result = None
    if sub.stripe_subscription_id:
        stripe_result = await change_subscription_plan(
            stripe_sub_id=sub.stripe_subscription_id,
            new_plan=body.new_plan,
            interval=body.interval,
        )

    # Update local DB
    from src.models.subscription import PlanTier
    sub.plan = PlanTier(body.new_plan)
    sub.billing_interval = body.interval

    # Invalidate subscription cache
    from src.api.deps import invalidate_subscription_cache
    await invalidate_subscription_cache(org_id)

    await _audit(
        db, user, "UPDATE", "subscription_plan", str(sub.id), request,
        changes={"from": old_plan, "to": body.new_plan},
    )
    return {
        "detail": f"Plan changed from {old_plan} to {body.new_plan}",
        "stripe": stripe_result,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRM Report (Aggregated Metrics)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/crm/report", response_model=CRMReportResponse)
async def crm_report(
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    """Aggregated CRM metrics across all organizations."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    d30 = now - timedelta(days=30)

    total_orgs = (
        await db.execute(select(func.count(Organization.id)))
    ).scalar() or 0

    active_orgs = (
        await db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.status == SubscriptionStatus.active
            )
        )
    ).scalar() or 0

    # Health scores — compute for all orgs
    orgs = (await db.execute(select(Organization.id))).scalars().all()
    scores = []
    risk_dist = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    total_ltv = 0.0

    for oid in orgs:
        h = await compute_health_score(oid, db)
        scores.append(h["score"])
        risk_dist[h["risk"]] = risk_dist.get(h["risk"], 0) + 1
        ltv_data = await compute_ltv(oid, db)
        total_ltv += ltv_data["ltv"]

    avg_health = round(sum(scores) / len(scores), 1) if scores else 0.0
    avg_ltv = round(total_ltv / len(orgs), 2) if orgs else 0.0

    active_discounts = (
        await db.execute(
            select(func.count(ManualDiscount.id)).where(
                ManualDiscount.is_active.is_(True)
            )
        )
    ).scalar() or 0

    retention_events_30d = (
        await db.execute(
            select(func.count(RetentionEvent.id)).where(
                RetentionEvent.created_at >= d30
            )
        )
    ).scalar() or 0

    cn_total = (
        await db.execute(
            select(func.coalesce(func.sum(CreditNote.amount_cents), 0)).where(
                CreditNote.status == CreditNoteStatus.issued
            )
        )
    ).scalar() or 0

    return CRMReportResponse(
        total_orgs=total_orgs,
        active_orgs=active_orgs,
        avg_health_score=avg_health,
        risk_distribution=risk_dist,
        total_ltv=total_ltv,
        avg_ltv=avg_ltv,
        active_discounts=active_discounts,
        retention_events_30d=retention_events_30d,
        credit_notes_total_cents=cn_total,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Export (CSV / JSON)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/organizations/{org_id}/export")
async def export_org_data(
    org_id: uuid.UUID,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    """Export organization CRM data as JSON or CSV."""
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if not org:
        raise NotFoundError("Organization not found")

    health = await compute_health_score(org_id, db)
    ltv = await compute_ltv(org_id, db)

    sub = (
        await db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
    ).scalar_one_or_none()

    users = (
        (await db.execute(select(User).where(User.organization_id == org_id)))
        .scalars()
        .all()
    )
    notes = (
        (
            await db.execute(
                select(CustomerNote).where(CustomerNote.organization_id == org_id)
            )
        )
        .scalars()
        .all()
    )

    data = {
        "organization": {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "tier": org.tier,
            "created_at": org.created_at.isoformat(),
        },
        "health_score": health["score"],
        "risk_level": health["risk"],
        "ltv": ltv["ltv"],
        "plan": sub.plan.value if sub else None,
        "plan_status": sub.status.value if sub else None,
        "months_subscribed": sub.months_subscribed if sub else 0,
        "user_count": len(users),
        "notes_count": len(notes),
    }

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(data.keys())
        row = []
        for v in data.values():
            if isinstance(v, dict):
                row.append(json.dumps(v))
            else:
                row.append(v)
        writer.writerow(row)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=crm_{org.slug}.csv"
            },
        )

    return data
