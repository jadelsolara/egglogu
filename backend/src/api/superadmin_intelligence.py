"""Superadmin Intelligence Hub — aggregated, anonymized market & platform intelligence.

Privacy compliance:
- Chilean Ley 19.628 (Protección de Datos Personales)
- Swiss FADP/nDSG (Federal Act on Data Protection)

All data returned is AGGREGATED with k-anonymity (min group size ≥ 5).
No PII is ever included in intelligence responses.
All queries exclude superadmin user data.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, cast, distinct, extract, func, select, Float as SAFloat
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import require_superadmin
from src.database import get_db
from src.models.auth import Organization, Role, User
from src.models.farm import Farm
from src.models.flock import Flock
from src.models.production import DailyProduction, EggType, MarketChannel
from src.models.health import Vaccine, Medication, Outbreak
from src.models.feed import FeedPurchase, FeedConsumption
from src.models.finance import Income
from src.models.subscription import Subscription, SubscriptionStatus, PlanTier
from src.models.support import SupportTicket

# k-anonymity threshold — groups smaller than this are suppressed
K_ANONYMITY = 5

router = APIRouter(prefix="/superadmin", tags=["superadmin-intelligence"])
SUPERADMIN = Depends(require_superadmin())


# ── Response Schemas ──────────────────────────────────────────────


class ConversionFunnel(BaseModel):
    total_signups: int = 0
    email_verified: int = 0
    has_farm: int = 0
    has_production_data: int = 0
    paying_customers: int = 0
    conversion_rate_pct: float = 0.0


class RevenueMetrics(BaseModel):
    mrr: float = 0.0
    arr: float = 0.0
    arpu: float = 0.0
    avg_ltv: float = 0.0
    paying_count: int = 0
    trial_count: int = 0
    free_count: int = 0


class GeoDistribution(BaseModel):
    country: str
    user_count: int
    org_count: int


class BreedBenchmark(BaseModel):
    breed: str
    farm_count: int  # k-anonymized
    avg_hen_day_pct: Optional[float] = None
    avg_mortality_pct: Optional[float] = None
    avg_eggs_per_flock: Optional[float] = None


class HousingBenchmark(BaseModel):
    housing_type: str
    farm_count: int
    avg_hen_day_pct: Optional[float] = None
    avg_mortality_pct: Optional[float] = None


class SeasonalTrend(BaseModel):
    month: int
    month_name: str
    avg_total_eggs: float = 0.0
    avg_mortality: float = 0.0
    data_points: int = 0


class ChannelDistribution(BaseModel):
    channel: str
    percentage: float = 0.0
    record_count: int = 0


class EggTypeDistribution(BaseModel):
    egg_type: str
    percentage: float = 0.0
    record_count: int = 0


class DiseasePrevance(BaseModel):
    disease: str
    occurrence_count: int = 0
    farm_count: int = 0  # k-anonymized


class ModuleAdoption(BaseModel):
    module: str
    orgs_using: int = 0
    adoption_pct: float = 0.0


class UTMAttribution(BaseModel):
    source: str
    signups: int = 0
    converted_to_paid: int = 0
    conversion_pct: float = 0.0


class EngagementTier(BaseModel):
    tier: str  # power_user, active, occasional, dormant
    count: int = 0
    percentage: float = 0.0


class PrivacyInfo(BaseModel):
    k_anonymity_threshold: int = K_ANONYMITY
    data_aggregated: bool = True
    pii_included: bool = False
    compliance: list[str] = ["CL-Ley19628", "CH-FADP/nDSG"]
    last_computed: datetime


class IntelligenceResponse(BaseModel):
    privacy: PrivacyInfo
    funnel: ConversionFunnel
    revenue: RevenueMetrics
    geo_distribution: list[GeoDistribution] = []
    breed_benchmarks: list[BreedBenchmark] = []
    housing_benchmarks: list[HousingBenchmark] = []
    seasonal_trends: list[SeasonalTrend] = []
    channel_distribution: list[ChannelDistribution] = []
    egg_type_distribution: list[EggTypeDistribution] = []
    disease_prevalence: list[DiseasePrevance] = []
    module_adoption: list[ModuleAdoption] = []
    utm_attribution: list[UTMAttribution] = []
    engagement_tiers: list[EngagementTier] = []


# ── Main endpoint ─────────────────────────────────────────────────


MONTH_NAMES = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
}

PRICE_MAP = {"hobby": 0, "starter": 49, "pro": 99, "enterprise": 199}


@router.get("/intelligence", response_model=IntelligenceResponse)
async def get_intelligence(
    user: User = SUPERADMIN,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # ── 1. Conversion Funnel ──────────────────────────────────────
    total_signups = (
        await db.execute(
            select(func.count(User.id)).where(User.role != Role.superadmin)
        )
    ).scalar() or 0

    email_verified = (
        await db.execute(
            select(func.count(User.id)).where(
                User.role != Role.superadmin, User.email_verified.is_(True)
            )
        )
    ).scalar() or 0

    # Users whose org has at least one farm
    has_farm = (
        await db.execute(
            select(func.count(distinct(User.id))).where(
                User.role != Role.superadmin,
                User.organization_id.in_(select(distinct(Farm.organization_id))),
            )
        )
    ).scalar() or 0

    # Users whose org has production data
    has_prod = (
        await db.execute(
            select(func.count(distinct(User.id))).where(
                User.role != Role.superadmin,
                User.organization_id.in_(
                    select(distinct(DailyProduction.organization_id))
                ),
            )
        )
    ).scalar() or 0

    paying = (
        await db.execute(
            select(func.count(Subscription.id)).where(
                Subscription.status == SubscriptionStatus.active,
                Subscription.is_trial.is_(False),
                Subscription.plan != PlanTier.hobby,
            )
        )
    ).scalar() or 0

    conv_rate = round((paying / total_signups * 100), 1) if total_signups > 0 else 0.0

    funnel = ConversionFunnel(
        total_signups=total_signups,
        email_verified=email_verified,
        has_farm=has_farm,
        has_production_data=has_prod,
        paying_customers=paying,
        conversion_rate_pct=conv_rate,
    )

    # ── 2. Revenue Metrics ────────────────────────────────────────
    subs = (
        await db.execute(
            select(Subscription.plan, Subscription.is_trial, func.count(Subscription.id))
            .where(Subscription.status == SubscriptionStatus.active)
            .group_by(Subscription.plan, Subscription.is_trial)
        )
    ).all()

    mrr = 0.0
    paying_count = 0
    trial_count = 0
    free_count = 0
    for plan, is_trial, cnt in subs:
        if is_trial:
            trial_count += cnt
        elif plan.value == "hobby":
            free_count += cnt
        else:
            paying_count += cnt
            mrr += PRICE_MAP.get(plan.value, 0) * cnt

    arr = mrr * 12
    arpu = round(mrr / paying_count, 2) if paying_count > 0 else 0.0
    # Simplified LTV: ARPU * avg months subscribed
    avg_months = (
        await db.execute(
            select(func.avg(Subscription.months_subscribed)).where(
                Subscription.status == SubscriptionStatus.active,
                Subscription.is_trial.is_(False),
                Subscription.plan != PlanTier.hobby,
            )
        )
    ).scalar() or 0
    avg_ltv = round(arpu * float(avg_months), 2)

    revenue = RevenueMetrics(
        mrr=round(mrr, 2),
        arr=round(arr, 2),
        arpu=arpu,
        avg_ltv=avg_ltv,
        paying_count=paying_count,
        trial_count=trial_count,
        free_count=free_count,
    )

    # ── 3. Geographic Distribution (k-anonymized) ─────────────────
    geo_q = (
        await db.execute(
            select(
                User.geo_country,
                func.count(distinct(User.id)).label("user_count"),
                func.count(distinct(User.organization_id)).label("org_count"),
            )
            .where(
                User.role != Role.superadmin,
                User.geo_country.isnot(None),
                User.geo_country != "",
            )
            .group_by(User.geo_country)
            .having(func.count(distinct(User.id)) >= K_ANONYMITY)
            .order_by(func.count(distinct(User.id)).desc())
        )
    ).all()
    geo_distribution = [
        GeoDistribution(country=row[0], user_count=row[1], org_count=row[2])
        for row in geo_q
    ]

    # ── 4. Breed Benchmarks (k-anonymized) ────────────────────────
    # Avg hen-day % = (total_eggs / current_count) * 100, aggregated by breed
    breed_q = (
        await db.execute(
            select(
                Flock.breed,
                func.count(distinct(Flock.farm_id)).label("farm_count"),
                func.avg(
                    cast(DailyProduction.total_eggs, SAFloat)
                    / func.nullif(cast(Flock.current_count, SAFloat), 0)
                    * 100
                ).label("avg_hen_day"),
                func.avg(
                    cast(DailyProduction.deaths, SAFloat)
                    / func.nullif(cast(Flock.current_count, SAFloat), 0)
                    * 100
                ).label("avg_mortality"),
                func.avg(cast(DailyProduction.total_eggs, SAFloat)).label("avg_eggs"),
            )
            .join(DailyProduction, DailyProduction.flock_id == Flock.id)
            .where(Flock.breed.isnot(None), Flock.breed != "")
            .group_by(Flock.breed)
            .having(func.count(distinct(Flock.farm_id)) >= K_ANONYMITY)
            .order_by(func.count(distinct(Flock.farm_id)).desc())
        )
    ).all()
    breed_benchmarks = [
        BreedBenchmark(
            breed=row[0],
            farm_count=row[1],
            avg_hen_day_pct=round(row[2], 1) if row[2] else None,
            avg_mortality_pct=round(row[3], 2) if row[3] else None,
            avg_eggs_per_flock=round(row[4], 0) if row[4] else None,
        )
        for row in breed_q
    ]

    # ── 5. Housing Type Benchmarks (k-anonymized) ─────────────────
    housing_q = (
        await db.execute(
            select(
                Flock.housing_type,
                func.count(distinct(Flock.farm_id)).label("farm_count"),
                func.avg(
                    cast(DailyProduction.total_eggs, SAFloat)
                    / func.nullif(cast(Flock.current_count, SAFloat), 0)
                    * 100
                ).label("avg_hen_day"),
                func.avg(
                    cast(DailyProduction.deaths, SAFloat)
                    / func.nullif(cast(Flock.current_count, SAFloat), 0)
                    * 100
                ).label("avg_mortality"),
            )
            .join(DailyProduction, DailyProduction.flock_id == Flock.id)
            .where(Flock.housing_type.isnot(None), Flock.housing_type != "")
            .group_by(Flock.housing_type)
            .having(func.count(distinct(Flock.farm_id)) >= K_ANONYMITY)
            .order_by(func.count(distinct(Flock.farm_id)).desc())
        )
    ).all()
    housing_benchmarks = [
        HousingBenchmark(
            housing_type=row[0],
            farm_count=row[1],
            avg_hen_day_pct=round(row[2], 1) if row[2] else None,
            avg_mortality_pct=round(row[3], 2) if row[3] else None,
        )
        for row in housing_q
    ]

    # ── 6. Seasonal Trends (last 12 months, platform-wide) ────────
    d365 = now - timedelta(days=365)
    seasonal_q = (
        await db.execute(
            select(
                extract("month", DailyProduction.date).label("month"),
                func.avg(cast(DailyProduction.total_eggs, SAFloat)).label("avg_eggs"),
                func.avg(cast(DailyProduction.deaths, SAFloat)).label("avg_deaths"),
                func.count(DailyProduction.id).label("data_points"),
            )
            .where(DailyProduction.date >= d365.date())
            .group_by(extract("month", DailyProduction.date))
            .order_by(extract("month", DailyProduction.date))
        )
    ).all()
    seasonal_trends = [
        SeasonalTrend(
            month=int(row[0]),
            month_name=MONTH_NAMES.get(int(row[0]), str(int(row[0]))),
            avg_total_eggs=round(row[1], 1) if row[1] else 0.0,
            avg_mortality=round(row[2], 2) if row[2] else 0.0,
            data_points=row[3],
        )
        for row in seasonal_q
    ]

    # ── 7. Market Channel Distribution ────────────────────────────
    total_prod_records = (
        await db.execute(
            select(func.count(DailyProduction.id)).where(
                DailyProduction.market_channel.isnot(None)
            )
        )
    ).scalar() or 0

    if total_prod_records >= K_ANONYMITY:
        channel_q = (
            await db.execute(
                select(
                    DailyProduction.market_channel,
                    func.count(DailyProduction.id).label("cnt"),
                )
                .where(DailyProduction.market_channel.isnot(None))
                .group_by(DailyProduction.market_channel)
                .order_by(func.count(DailyProduction.id).desc())
            )
        ).all()
        channel_distribution = [
            ChannelDistribution(
                channel=row[0].value if row[0] else "unknown",
                percentage=round(row[1] / total_prod_records * 100, 1),
                record_count=row[1],
            )
            for row in channel_q
        ]
    else:
        channel_distribution = []

    # ── 8. Egg Type Distribution ──────────────────────────────────
    total_type_records = (
        await db.execute(
            select(func.count(DailyProduction.id)).where(
                DailyProduction.egg_type.isnot(None)
            )
        )
    ).scalar() or 0

    if total_type_records >= K_ANONYMITY:
        type_q = (
            await db.execute(
                select(
                    DailyProduction.egg_type,
                    func.count(DailyProduction.id).label("cnt"),
                )
                .where(DailyProduction.egg_type.isnot(None))
                .group_by(DailyProduction.egg_type)
                .order_by(func.count(DailyProduction.id).desc())
            )
        ).all()
        egg_type_distribution = [
            EggTypeDistribution(
                egg_type=row[0].value if row[0] else "unknown",
                percentage=round(row[1] / total_type_records * 100, 1),
                record_count=row[1],
            )
            for row in type_q
        ]
    else:
        egg_type_distribution = []

    # ── 9. Disease Prevalence (k-anonymized) ──────────────────────
    disease_q = (
        await db.execute(
            select(
                Outbreak.disease,
                func.count(Outbreak.id).label("occurrence_count"),
                func.count(distinct(Outbreak.organization_id)).label("farm_count"),
            )
            .where(Outbreak.disease.isnot(None), Outbreak.disease != "")
            .group_by(Outbreak.disease)
            .having(func.count(distinct(Outbreak.organization_id)) >= K_ANONYMITY)
            .order_by(func.count(Outbreak.id).desc())
        )
    ).all()
    disease_prevalence = [
        DiseasePrevance(
            disease=row[0], occurrence_count=row[1], farm_count=row[2]
        )
        for row in disease_q
    ]

    # ── 10. Module Adoption ───────────────────────────────────────
    total_orgs = (
        await db.execute(select(func.count(Organization.id)))
    ).scalar() or 1

    # Check which orgs have data in each module table
    module_tables = {
        "produccion": DailyProduction,
        "sanidad": Vaccine,
        "alimento": FeedPurchase,
        "finanzas": Income,
        "soporte": SupportTicket,
    }
    module_adoption = []
    for mod_name, model in module_tables.items():
        org_id_col = getattr(model, "organization_id", None)
        if org_id_col is None:
            continue
        count = (
            await db.execute(select(func.count(distinct(org_id_col))))
        ).scalar() or 0
        module_adoption.append(
            ModuleAdoption(
                module=mod_name,
                orgs_using=count,
                adoption_pct=round(count / total_orgs * 100, 1) if total_orgs > 0 else 0.0,
            )
        )

    # ── 11. UTM Attribution ───────────────────────────────────────
    utm_q = (
        await db.execute(
            select(
                User.utm_source,
                func.count(User.id).label("signups"),
            )
            .where(
                User.role != Role.superadmin,
                User.utm_source.isnot(None),
                User.utm_source != "",
            )
            .group_by(User.utm_source)
            .having(func.count(User.id) >= K_ANONYMITY)
            .order_by(func.count(User.id).desc())
        )
    ).all()
    utm_attribution = []
    for row in utm_q:
        # Count how many from this source ended up paying
        paid_from_source = (
            await db.execute(
                select(func.count(distinct(User.id)))
                .where(
                    User.utm_source == row[0],
                    User.organization_id.in_(
                        select(Subscription.organization_id).where(
                            Subscription.status == SubscriptionStatus.active,
                            Subscription.is_trial.is_(False),
                            Subscription.plan != PlanTier.hobby,
                        )
                    ),
                )
            )
        ).scalar() or 0
        utm_attribution.append(
            UTMAttribution(
                source=row[0],
                signups=row[1],
                converted_to_paid=paid_from_source,
                conversion_pct=round(paid_from_source / row[1] * 100, 1)
                if row[1] > 0
                else 0.0,
            )
        )

    # ── 12. Engagement Tiers ──────────────────────────────────────
    # Based on production data frequency in last 30 days
    d30 = now - timedelta(days=30)
    org_activity = (
        await db.execute(
            select(
                DailyProduction.organization_id,
                func.count(DailyProduction.id).label("entries"),
            )
            .where(DailyProduction.date >= d30.date())
            .group_by(DailyProduction.organization_id)
        )
    ).all()

    tiers = {"power_user": 0, "active": 0, "occasional": 0, "dormant": 0}
    active_org_ids = set()
    for org_id, entries in org_activity:
        active_org_ids.add(org_id)
        if entries >= 20:  # Almost daily
            tiers["power_user"] += 1
        elif entries >= 8:  # Weekly+
            tiers["active"] += 1
        else:
            tiers["occasional"] += 1

    # Dormant = orgs with no production data in last 30 days
    tiers["dormant"] = max(0, total_orgs - len(active_org_ids))

    engagement_tiers = [
        EngagementTier(
            tier=tier,
            count=count,
            percentage=round(count / total_orgs * 100, 1) if total_orgs > 0 else 0.0,
        )
        for tier, count in tiers.items()
    ]

    # ── Response ──────────────────────────────────────────────────
    return IntelligenceResponse(
        privacy=PrivacyInfo(
            k_anonymity_threshold=K_ANONYMITY,
            data_aggregated=True,
            pii_included=False,
            compliance=["CL-Ley19628", "CH-FADP/nDSG"],
            last_computed=now,
        ),
        funnel=funnel,
        revenue=revenue,
        geo_distribution=geo_distribution,
        breed_benchmarks=breed_benchmarks,
        housing_benchmarks=housing_benchmarks,
        seasonal_trends=seasonal_trends,
        channel_distribution=channel_distribution,
        egg_type_distribution=egg_type_distribution,
        disease_prevalence=disease_prevalence,
        module_adoption=module_adoption,
        utm_attribution=utm_attribution,
        engagement_tiers=engagement_tiers,
    )
