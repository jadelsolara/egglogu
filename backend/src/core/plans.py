from typing import Optional

from src.core.exceptions import ForbiddenError

# ── Feature matrix: 4 tiers + suspended ──
# Trial: 30 days Enterprise free, then choose a plan or get suspended
# Year 1 soft landing: Q1 40% off → Q2 25% off → Q3 15% off → Q4 full price

PLAN_LIMITS = {
    "suspended": {
        "price_monthly": 0,
        "price_annual": 0,
        "farms": 0,
        "flocks": 0,
        "users": 0,
        "modules": [],
        "health": False,
        "fcr": False,
        "finance": False,
        "biosecurity": False,
        "traceability": False,
        "planning": False,
        "ai_predictions": False,
        "field_mode": False,
        "vet_mode": False,
        "iot": False,
        "i18n": False,
        "offline": False,
        "dark_mode": True,
        "support_tickets": 0,
        "support_sla_hours": None,
    },
    "hobby": {
        "price_monthly": 9,
        "price_annual": 90,  # 2 months free
        "farms": 1,
        "flocks": 3,
        "users": 2,
        "modules": ["dashboard", "production", "feed"],
        "health": False,
        "fcr": True,
        "finance": False,
        "biosecurity": False,
        "traceability": False,
        "planning": False,
        "ai_predictions": False,
        "field_mode": False,
        "vet_mode": False,
        "iot": False,
        "i18n": False,
        "offline": True,
        "dark_mode": True,
        "support_tickets": 3,
        "support_sla_hours": None,  # FAQ only
    },
    "starter": {
        "price_monthly": 19,
        "price_annual": 190,
        "farms": 3,
        "flocks": 10,
        "users": 5,
        "modules": ["dashboard", "production", "health", "feed", "clients", "finance", "environment"],
        "health": True,
        "fcr": True,
        "finance": True,
        "biosecurity": False,
        "traceability": False,
        "planning": False,
        "ai_predictions": False,
        "field_mode": True,
        "vet_mode": False,
        "iot": False,
        "i18n": True,
        "offline": True,
        "dark_mode": True,
        "support_tickets": 10,
        "support_sla_hours": 48,
    },
    "pro": {
        "price_monthly": 49,
        "price_annual": 490,
        "farms": 10,
        "flocks": None,  # unlimited
        "users": 15,
        "modules": [
            "dashboard", "production", "health", "feed", "clients",
            "finance", "environment", "operations", "biosecurity",
            "traceability", "planning",
        ],
        "health": True,
        "fcr": True,
        "finance": True,
        "biosecurity": True,
        "traceability": True,
        "planning": True,
        "ai_predictions": True,
        "field_mode": True,
        "vet_mode": True,
        "iot": False,
        "i18n": True,
        "offline": True,
        "dark_mode": True,
        "support_tickets": None,  # unlimited
        "support_sla_hours": 12,
    },
    "enterprise": {
        "price_monthly": 99,
        "price_annual": 990,
        "farms": None,
        "flocks": None,
        "users": None,
        "modules": "all",
        "health": True,
        "fcr": True,
        "finance": True,
        "biosecurity": True,
        "traceability": True,
        "planning": True,
        "ai_predictions": True,
        "field_mode": True,
        "vet_mode": True,
        "iot": True,
        "i18n": True,
        "offline": True,
        "dark_mode": True,
        "support_tickets": None,
        "support_sla_hours": 4,
    },
}

ALL_MODULES = [
    "dashboard", "production", "health", "feed", "clients",
    "finance", "environment", "operations", "biosecurity",
    "traceability", "planning", "iot",
]

ALL_FEATURES = [
    "health", "fcr", "finance", "biosecurity", "traceability",
    "planning", "ai_predictions", "field_mode", "vet_mode",
    "iot", "i18n", "offline", "dark_mode",
]

# Tier ordering for upgrade/downgrade checks
TIER_ORDER = ["suspended", "hobby", "starter", "pro", "enterprise"]


def get_plan_limits(plan: str) -> dict:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["suspended"])


def check_plan_limit(plan: str, resource: str, current_count: int) -> None:
    limits = get_plan_limits(plan)
    max_val = limits.get(resource)
    if max_val is not None and current_count >= max_val:
        raise ForbiddenError(
            f"Limit reached: max {max_val} {resource}. Upgrade your plan to continue."
        )


def check_feature_access(plan: str, feature: str) -> None:
    limits = get_plan_limits(plan)
    if not limits.get(feature, False):
        raise ForbiddenError(
            f"Feature '{feature}' requires a higher plan. Upgrade to access."
        )


def get_allowed_modules(plan: str) -> list[str]:
    limits = get_plan_limits(plan)
    modules = limits.get("modules", [])
    if modules == "all":
        return ALL_MODULES
    return modules


def get_allowed_features(plan: str) -> list[str]:
    limits = get_plan_limits(plan)
    return [f for f in ALL_FEATURES if limits.get(f, False)]


def get_plan_summary(plan: str) -> dict:
    """Return a public-safe summary of plan capabilities."""
    limits = get_plan_limits(plan)
    return {
        "plan": plan,
        "price_monthly": limits.get("price_monthly"),
        "price_annual": limits.get("price_annual"),
        "limits": {
            "farms": limits.get("farms"),
            "flocks": limits.get("flocks"),
            "users": limits.get("users"),
        },
        "modules": get_allowed_modules(plan),
        "features": get_allowed_features(plan),
    }


def is_upgrade(current: str, target: str) -> bool:
    """Check if target plan is higher than current."""
    cur_idx = TIER_ORDER.index(current) if current in TIER_ORDER else 0
    tgt_idx = TIER_ORDER.index(target) if target in TIER_ORDER else 0
    return tgt_idx > cur_idx
