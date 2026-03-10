"""
Register all EGGlogU module API routers with the FastAPI app.

Usage in main.py:
    from modules.egg.backend.api.register import register_egg_routes
    register_egg_routes(app, prefix="/api/v1")

When FarmLogU supports multiple verticals, each module will have its own
register.py that follows this same pattern.
"""

from backend.src.api import (
    flocks,
    production,
    health,
    feed,
    clients,
    finance,
    environment,
    operations,
    biosecurity,
    traceability,
    trace_events,
    trace_public,
    planning,
    inventory,
    grading,
    purchase_orders,
    compliance,
    cost_centers,
    analytics,
    animal_welfare,
    community,
    support,
    accounting,
    reports,
    workflows,
)


def register_egg_routes(app, prefix="/api/v1"):
    """Register all EGGlogU-specific API routers."""
    egg_routers = [
        flocks.router,
        production.router,
        health.router,
        feed.router,
        clients.router,
        finance.router,
        environment.router,
        operations.router,
        biosecurity.router,
        traceability.router,
        trace_events.router,
        planning.router,
        inventory.router,
        grading.router,
        purchase_orders.router,
        compliance.router,
        cost_centers.router,
        analytics.router,
        animal_welfare.router,
        community.router,
        support.router,
        accounting.router,
        reports.router,
        workflows.router,
    ]

    for router in egg_routers:
        app.include_router(router, prefix=prefix)

    # Public routes (no version prefix)
    app.include_router(trace_public.router)
