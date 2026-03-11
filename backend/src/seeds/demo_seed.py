"""Demo seed data for EGGlogU — realistic poultry farm scenario.

Creates:
- 1 Organization (Granja Demo)
- 1 User (owner)
- 2 Farms
- 4 Flocks (2 per farm)
- 90 days of DailyProduction per flock (360 records)
- 5 Clients with prices
- 30 Incomes
- 20 Expenses
- 10 Vaccines
- 5 FeedPurchases
- 10 FeedConsumption records
- 5 EnvironmentReadings
"""

import uuid
import random
from datetime import date, timedelta

import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.auth import Organization, User, Role
from src.models.farm import Farm
from src.models.flock import Flock
from src.models.production import DailyProduction
from src.models.client import Client
from src.models.finance import Income, Expense
from src.models.health import Vaccine
from src.models.feed import FeedPurchase, FeedConsumption
from src.models.environment import EnvironmentReading


# Fixed UUIDs for reproducibility
ORG_ID = uuid.UUID("00000000-0000-4000-a000-000000000001")
USER_ID = uuid.UUID("00000000-0000-4000-a000-000000000002")
FARM1_ID = uuid.UUID("00000000-0000-4000-a000-000000000010")
FARM2_ID = uuid.UUID("00000000-0000-4000-a000-000000000011")
FLOCK_IDS = [uuid.UUID(f"00000000-0000-4000-a000-0000000001{i:02d}") for i in range(4)]
CLIENT_IDS = [uuid.UUID(f"00000000-0000-4000-a000-0000000002{i:02d}") for i in range(5)]


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _production_curve(week: int, bird_count: int) -> int:
    """Simulate realistic egg production based on week of lay."""
    if week < 1:
        return 0
    elif week <= 4:
        pct = 0.10 + (week * 0.15)
    elif week <= 12:
        pct = 0.70 + ((week - 4) * 0.03)
    elif week <= 40:
        pct = 0.94 - ((week - 12) * 0.003)
    elif week <= 72:
        pct = 0.85 - ((week - 40) * 0.005)
    else:
        pct = 0.65 - ((week - 72) * 0.008)

    pct = max(0.10, min(0.98, pct))
    daily_variation = random.uniform(-0.05, 0.05)
    return max(0, int(bird_count * (pct + daily_variation)))


async def seed_demo_data(db: AsyncSession) -> dict:
    """Seed demo data. Returns summary of created records."""
    random.seed(42)
    counts = {}

    # ── Organization ──────────────────────────────────
    org = Organization(
        id=ORG_ID,
        name="Granja Demo SA",
        slug="granja-demo",
        tier="professional",
        vertical="eggs",
    )
    db.add(org)
    counts["organizations"] = 1

    # ── User (owner) ──────────────────────────────────
    user = User(
        id=USER_ID,
        email="demo@egglogu.com",
        hashed_password=_hash_password("Demo2026!"),
        full_name="Juan Demo",
        role=Role.owner,
        organization_id=ORG_ID,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    counts["users"] = 1

    # ── Farms ─────────────────────────────────────────
    farms = [
        Farm(
            id=FARM1_ID,
            organization_id=ORG_ID,
            name="Granja Principal",
            lat=-33.4489,
            lng=-70.6693,
        ),
        Farm(
            id=FARM2_ID,
            organization_id=ORG_ID,
            name="Granja Norte",
            lat=-33.3500,
            lng=-70.6000,
        ),
    ]
    db.add_all(farms)
    counts["farms"] = 2

    # ── Flocks ────────────────────────────────────────
    flock_data = [
        ("Lote Hy-Line W-36 A", FARM1_ID, 2500, "Hy-Line W-36", "cage-free"),
        ("Lote Lohmann Brown B", FARM1_ID, 1800, "Lohmann Brown", "conventional"),
        ("Lote ISA Brown C", FARM2_ID, 3000, "ISA Brown", "free-range"),
        ("Lote Hy-Line W-80 D", FARM2_ID, 1200, "Hy-Line W-80", "organic"),
    ]

    today = date.today()
    flocks = []
    for i, (name, farm_id, count, breed, housing) in enumerate(flock_data):
        start = today - timedelta(days=90 + i * 30)
        flock = Flock(
            id=FLOCK_IDS[i],
            organization_id=ORG_ID,
            farm_id=farm_id,
            name=name,
            initial_count=count,
            current_count=count - random.randint(5, 30),
            start_date=start,
            breed=breed,
            housing_type=housing,
            is_active=True,
        )
        flocks.append(flock)
    db.add_all(flocks)
    counts["flocks"] = 4

    # ── Daily Production (90 days per flock) ──────────
    productions = []
    for flock in flocks:
        for day_offset in range(90):
            d = flock.start_date + timedelta(days=day_offset)
            if d > today:
                break
            week = day_offset // 7
            total = _production_curve(week, flock.current_count)
            broken = max(0, int(total * random.uniform(0.005, 0.02)))
            sellable = total - broken

            small = int(sellable * 0.08)
            medium = int(sellable * 0.25)
            large = int(sellable * 0.45)
            xl = sellable - small - medium - large

            deaths = 1 if random.random() < 0.03 else 0

            productions.append(
                DailyProduction(
                    organization_id=ORG_ID,
                    flock_id=flock.id,
                    date=d,
                    total_eggs=total,
                    broken=broken,
                    small=small,
                    medium=medium,
                    large=large,
                    xl=xl,
                    deaths=deaths,
                    water_liters=flock.current_count * random.uniform(0.22, 0.30),
                )
            )

    db.add_all(productions)
    counts["daily_production"] = len(productions)

    # ── Clients ───────────────────────────────────────
    client_data = [
        ("Supermercado El Centro", "+56912345678", 1.80, 2.00, 2.40, 2.80),
        ("Restaurant La Mesa", "+56923456789", 1.90, 2.10, 2.50, 2.90),
        ("Panaderia Don Pedro", "+56934567890", 1.85, 2.05, 2.45, 2.85),
        ("Tienda Doña Rosa", "+56945678901", 2.00, 2.20, 2.60, 3.00),
        ("Mayorista Huevos SA", "+56956789012", 1.60, 1.80, 2.20, 2.50),
    ]

    clients = []
    for i, (name, phone, ps, pm, pl, px) in enumerate(client_data):
        c = Client(
            id=CLIENT_IDS[i],
            organization_id=ORG_ID,
            name=name,
            phone=phone,
            price_small=ps,
            price_medium=pm,
            price_large=pl,
            price_xl=px,
        )
        clients.append(c)
    db.add_all(clients)
    counts["clients"] = 5

    # ── Incomes ───────────────────────────────────────
    incomes = []
    for i in range(30):
        d = today - timedelta(days=random.randint(1, 85))
        client = random.choice(clients)
        dozens = random.randint(10, 200)
        sizes = ["small", "medium", "large", "xl"]
        size = random.choice(sizes)
        price_map = {
            "small": client.price_small,
            "medium": client.price_medium,
            "large": client.price_large,
            "xl": client.price_xl,
        }
        unit_price = price_map[size] or 2.0
        incomes.append(
            Income(
                organization_id=ORG_ID,
                client_id=client.id,
                date=d,
                dozens=dozens,
                egg_size=size,
                unit_price=unit_price,
                total=dozens * unit_price,
                payment_method=random.choice(["cash", "transfer", "credit"]),
            )
        )
    db.add_all(incomes)
    counts["incomes"] = 30

    # ── Expenses ──────────────────────────────────────
    expense_categories = [
        ("feed", 500, 3000),
        ("utilities", 100, 500),
        ("labor", 800, 2500),
        ("veterinary", 50, 800),
        ("packaging", 30, 300),
        ("transport", 50, 400),
        ("maintenance", 100, 1000),
    ]
    expenses = []
    for i in range(20):
        cat, lo, hi = random.choice(expense_categories)
        d = today - timedelta(days=random.randint(1, 85))
        expenses.append(
            Expense(
                organization_id=ORG_ID,
                date=d,
                category=cat,
                description=f"Gasto {cat} #{i + 1}",
                amount=round(random.uniform(lo, hi), 2),
                flock_id=random.choice(FLOCK_IDS)
                if cat in ("feed", "veterinary")
                else None,
            )
        )
    db.add_all(expenses)
    counts["expenses"] = 20

    # ── Vaccines ──────────────────────────────────────
    vaccine_names = [
        ("Newcastle B1", "spray"),
        ("Newcastle LaSota", "drinking_water"),
        ("Infectious Bronchitis H120", "spray"),
        ("Gumboro (IBD)", "drinking_water"),
        ("Marek HVT", "injection"),
        ("Avian Encephalomyelitis", "drinking_water"),
        ("Fowl Pox", "wing_web"),
        ("Infectious Laryngotracheitis", "eye_drop"),
    ]
    vaccines = []
    for i in range(10):
        vname, method = random.choice(vaccine_names)
        flock = random.choice(flocks)
        d = flock.start_date + timedelta(days=random.randint(1, 60))
        vaccines.append(
            Vaccine(
                organization_id=ORG_ID,
                flock_id=flock.id,
                date=d,
                name=vname,
                method=method,
                cost=round(random.uniform(20, 200), 2),
            )
        )
    db.add_all(vaccines)
    counts["vaccines"] = 10

    # ── Feed Purchases ────────────────────────────────
    feed_purchases = []
    for i in range(5):
        d = today - timedelta(days=random.randint(5, 80))
        kg = random.randint(500, 5000)
        ppk = round(random.uniform(0.35, 0.65), 2)
        feed_purchases.append(
            FeedPurchase(
                organization_id=ORG_ID,
                date=d,
                type=random.choice(["starter", "grower", "layer", "finisher"]),
                brand=random.choice(["Purina", "Cargill", "ADM", "Nutreco"]),
                kg=kg,
                price_per_kg=ppk,
                total_cost=round(kg * ppk, 2),
            )
        )
    db.add_all(feed_purchases)
    counts["feed_purchases"] = 5

    # ── Feed Consumption ──────────────────────────────
    consumptions = []
    for i in range(10):
        flock = random.choice(flocks)
        d = today - timedelta(days=random.randint(1, 60))
        grams = flock.current_count * random.uniform(105, 125)
        consumptions.append(
            FeedConsumption(
                organization_id=ORG_ID,
                flock_id=flock.id,
                date=d,
                feed_kg=round(grams / 1000, 1),
            )
        )
    db.add_all(consumptions)
    counts["feed_consumption"] = 10

    # ── Environment Readings ──────────────────────────
    env_readings = []
    for i in range(5):
        d = today - timedelta(days=i * 7)
        env_readings.append(
            EnvironmentReading(
                organization_id=ORG_ID,
                date=d,
                temp_c=round(random.uniform(18, 32), 1),
                humidity_pct=round(random.uniform(40, 80), 1),
                light_lux=round(random.uniform(200, 800), 0),
            )
        )
    db.add_all(env_readings)
    counts["environment_readings"] = 5

    await db.commit()
    return counts
