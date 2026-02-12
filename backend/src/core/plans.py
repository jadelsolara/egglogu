from typing import Optional

from src.core.exceptions import ForbiddenError

# ── Feature matrix per plan ──
# Based on competitive analysis vs PoultryCare($79), EggTrac($106), Farmbrite($19)
# EGGlogU undercuts everyone while offering more features at each tier.

PLAN_LIMITS = {
    "free": {
        "price_monthly": 0,
        "farms": 1,
        "flocks": 2,
        "users": 1,
        "modules": [
            "dashboard", "production", "feed",
            "clients", "environment", "operations",
        ],
        # Feature flags
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
        # Universal (PWA-level, always on)
        "offline": True,
        "dark_mode": True,
    },
    "pro": {
        "price_monthly": 29,
        "farms": 5,
        "flocks": None,  # unlimited
        "users": 10,
        "modules": [
            "dashboard", "production", "health", "feed",
            "clients", "finance", "environment", "operations",
            "biosecurity", "traceability", "planning",
        ],
        "health": True,
        "fcr": True,
        "finance": True,
        "biosecurity": True,
        "traceability": True,
        "planning": True,
        "ai_predictions": False,
        "field_mode": False,
        "vet_mode": False,
        "iot": False,
        "i18n": True,
        "offline": True,
        "dark_mode": True,
    },
    "business": {
        "price_monthly": 79,
        "farms": None,  # unlimited
        "flocks": None,
        "users": None,  # unlimited
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
    },
    "enterprise": {
        "price_monthly": None,  # custom pricing
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
    },
}

ALL_MODULES = [
    "dashboard", "production", "health", "feed", "clients",
    "finance", "environment", "operations", "biosecurity",
    "traceability", "planning", "iot",
]

# Features that are plan-gated (not module-level, but feature-level)
ALL_FEATURES = [
    "health", "fcr", "finance", "biosecurity", "traceability",
    "planning", "ai_predictions", "field_mode", "vet_mode",
    "iot", "i18n", "offline", "dark_mode",
]


def get_plan_limits(plan: str) -> dict:
    return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])


def check_plan_limit(plan: str, resource: str, current_count: int) -> None:
    limits = get_plan_limits(plan)
    max_val = limits.get(resource)
    if max_val is not None and current_count >= max_val:
        raise ForbiddenError(
            f"Plan '{plan}' limit reached: max {max_val} {resource}. Upgrade to continue."
        )


def check_feature_access(plan: str, feature: str) -> None:
    limits = get_plan_limits(plan)
    if not limits.get(feature, False):
        raise ForbiddenError(
            f"Feature '{feature}' not available on plan '{plan}'. Upgrade to access."
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
        "limits": {
            "farms": limits.get("farms"),
            "flocks": limits.get("flocks"),
            "users": limits.get("users"),
        },
        "modules": get_allowed_modules(plan),
        "features": get_allowed_features(plan),
    }
