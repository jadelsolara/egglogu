"""
FarmLogU Vertical Registry — Multi-Vertical Agricultural ERP Platform

Each vertical (EGGlogU, PigLogu, CowLogu, CropLogu) plugs into the shared
core (accounting, traceability, auth, audit, billing) but has its own
production models, KPIs, and domain logic.

An Organization is bound to ONE vertical.  FarmLogU consolidated view
aggregates across organizations owned by the same holding/user.
"""

import enum
from dataclasses import dataclass


# ── Vertical Enum (stored in organizations.vertical) ──


class Vertical(str, enum.Enum):
    EGGS = "eggs"  # EGGlogU — Poultry / egg production
    PIGS = "pigs"  # PigLogu — Swine production
    CATTLE = "cattle"  # CowLogu — Dairy & beef
    CROPS = "crops"  # CropLogu — Row crops, fruits, vegetables
    AQUA = "aqua"  # AquaLogu — Aquaculture (future)
    MULTI = "multi"  # Mixed farm (multiple verticals)


# ── Feature gate flags ──


class Feature(str, enum.Enum):
    """Features that can be enabled/disabled per vertical."""

    FLOCKS = "flocks"  # Production units: flocks
    HERDS = "herds"  # Production units: herds
    FIELDS = "fields"  # Production units: crop fields
    PONDS = "ponds"  # Production units: ponds/tanks
    EGG_GRADING = "egg_grading"  # Egg classification/grading
    SLAUGHTER = "slaughter"  # Slaughter lots / carcass tracking
    MILKING = "milking"  # Milking sessions / milk quality
    HARVEST = "harvest"  # Harvest lots / crop yield
    BREED_CURVES = "breed_curves"  # Breed performance curves (poultry)
    GROWTH_CURVES = "growth_curves"  # Growth/weight curves (swine, cattle)
    BIOSECURITY = "biosecurity"  # Biosecurity zones & visitors
    ANIMAL_WELFARE = "animal_welfare"  # Welfare assessments
    VACCINATION = "vaccination"  # Vaccine scheduling
    FEED_MANAGEMENT = "feed_management"  # Feed purchase & consumption
    IRRIGATION = "irrigation"  # Irrigation management (crops)
    SOIL_ANALYSIS = "soil_analysis"  # Soil analysis (crops)


# ── Vertical definitions ──


@dataclass(frozen=True)
class VerticalConfig:
    """Configuration for a vertical product line."""

    code: Vertical
    name: str
    product_name: str  # What the vertical produces
    unit_name: str  # Production unit name (flock, herd, field)
    unit_name_plural: str
    primary_unit_of_measure: str  # units, kg, liters, tonnes
    features: frozenset[Feature]
    cost_categories: tuple[str, ...]  # Domain-specific cost categories
    kpi_metrics: tuple[str, ...]  # Domain-specific KPIs
    product_categories: tuple[str, ...]  # ProductCategory values this vertical uses
    icon: str = ""  # Emoji for UI


# ── Registry ──

VERTICALS: dict[Vertical, VerticalConfig] = {
    Vertical.EGGS: VerticalConfig(
        code=Vertical.EGGS,
        name="EGGlogU",
        product_name="Eggs",
        unit_name="flock",
        unit_name_plural="flocks",
        primary_unit_of_measure="units",
        features=frozenset(
            {
                Feature.FLOCKS,
                Feature.EGG_GRADING,
                Feature.BREED_CURVES,
                Feature.BIOSECURITY,
                Feature.ANIMAL_WELFARE,
                Feature.VACCINATION,
                Feature.FEED_MANAGEMENT,
            }
        ),
        cost_categories=(
            "feed",
            "medication",
            "labor",
            "energy",
            "water",
            "packaging",
            "transport",
            "maintenance",
            "depreciation",
            "pullet_amortization",
            "insurance",
            "veterinary",
            "cleaning",
        ),
        kpi_metrics=(
            "laying_rate_pct",
            "feed_conversion_ratio",
            "mortality_rate",
            "cost_per_egg",
            "cost_per_dozen",
            "eggs_per_housed_hen",
        ),
        product_categories=("eggs", "poultry_meat", "byproduct"),
        icon="🥚",
    ),
    Vertical.PIGS: VerticalConfig(
        code=Vertical.PIGS,
        name="PigLogu",
        product_name="Pork",
        unit_name="herd",
        unit_name_plural="herds",
        primary_unit_of_measure="kg",
        features=frozenset(
            {
                Feature.HERDS,
                Feature.SLAUGHTER,
                Feature.GROWTH_CURVES,
                Feature.BIOSECURITY,
                Feature.ANIMAL_WELFARE,
                Feature.VACCINATION,
                Feature.FEED_MANAGEMENT,
            }
        ),
        cost_categories=(
            "feed",
            "medication",
            "labor",
            "energy",
            "water",
            "transport",
            "maintenance",
            "depreciation",
            "piglet_purchase",
            "insurance",
            "veterinary",
            "cleaning",
            "slaughter",
        ),
        kpi_metrics=(
            "daily_weight_gain_g",
            "feed_conversion_ratio",
            "mortality_rate",
            "cost_per_kg_live",
            "litter_size_avg",
            "days_to_market",
        ),
        product_categories=("pork", "byproduct"),
        icon="🐷",
    ),
    Vertical.CATTLE: VerticalConfig(
        code=Vertical.CATTLE,
        name="CowLogu",
        product_name="Dairy & Beef",
        unit_name="herd",
        unit_name_plural="herds",
        primary_unit_of_measure="liters",
        features=frozenset(
            {
                Feature.HERDS,
                Feature.MILKING,
                Feature.GROWTH_CURVES,
                Feature.BIOSECURITY,
                Feature.ANIMAL_WELFARE,
                Feature.VACCINATION,
                Feature.FEED_MANAGEMENT,
            }
        ),
        cost_categories=(
            "feed",
            "medication",
            "labor",
            "energy",
            "water",
            "transport",
            "maintenance",
            "depreciation",
            "calf_purchase",
            "insurance",
            "veterinary",
            "cleaning",
            "milking_supplies",
        ),
        kpi_metrics=(
            "liters_per_cow_day",
            "fat_pct",
            "protein_pct",
            "somatic_cell_count",
            "feed_conversion_ratio",
            "calving_interval_days",
            "cost_per_liter",
        ),
        product_categories=("dairy", "beef", "byproduct"),
        icon="🐄",
    ),
    Vertical.CROPS: VerticalConfig(
        code=Vertical.CROPS,
        name="CropLogu",
        product_name="Crops",
        unit_name="field",
        unit_name_plural="fields",
        primary_unit_of_measure="tonnes",
        features=frozenset(
            {
                Feature.FIELDS,
                Feature.HARVEST,
                Feature.IRRIGATION,
                Feature.SOIL_ANALYSIS,
            }
        ),
        cost_categories=(
            "seed",
            "fertilizer",
            "pesticide",
            "labor",
            "energy",
            "water",
            "transport",
            "maintenance",
            "depreciation",
            "irrigation",
            "insurance",
            "land_lease",
        ),
        kpi_metrics=(
            "yield_per_hectare",
            "cost_per_tonne",
            "water_use_per_hectare",
            "fertilizer_per_hectare",
            "revenue_per_hectare",
        ),
        product_categories=("crops", "byproduct"),
        icon="🌾",
    ),
}


def get_vertical(code: Vertical) -> VerticalConfig:
    """Get vertical configuration. Raises KeyError if not found."""
    return VERTICALS[code]


def get_vertical_for_org(vertical_str: str) -> VerticalConfig:
    """Get vertical config from the string stored in organizations.vertical."""
    return VERTICALS[Vertical(vertical_str)]


def has_feature(vertical: Vertical, feature: Feature) -> bool:
    """Check if a vertical has a specific feature enabled."""
    config = VERTICALS.get(vertical)
    if config is None:
        return False
    return feature in config.features


def all_verticals() -> list[VerticalConfig]:
    """Return all registered verticals."""
    return list(VERTICALS.values())
