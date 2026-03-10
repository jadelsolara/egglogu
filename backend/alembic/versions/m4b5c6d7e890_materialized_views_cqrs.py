"""Create materialized views for CQRS analytics.

Revision ID: m4b5c6d7e890
Revises: l3a4b5c6d789
Create Date: 2026-03-03

Materialized views pre-aggregate heavy analytics queries so the primary DB
is never hit by long-running reporting scans.  Refresh via Celery Beat every
15 minutes.
"""

from alembic import op


revision = "m4b5c6d7e890"
down_revision = "l3a4b5c6d789"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Daily production summary per flock ──────────────────────────
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_production_summary AS
        SELECT
            dp.organization_id,
            dp.flock_id,
            f.name AS flock_name,
            dp.date,
            dp.total_eggs,
            dp.broken,
            dp.deaths,
            f.current_count,
            CASE WHEN f.current_count > 0
                 THEN ROUND((dp.total_eggs::numeric / f.current_count) * 100, 2)
                 ELSE 0
            END AS hen_day_pct,
            dp.egg_mass_g,
            dp.created_at
        FROM daily_production dp
        JOIN flocks f ON f.id = dp.flock_id
        ORDER BY dp.organization_id, dp.flock_id, dp.date
        WITH DATA
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_prod_org_flock_date
        ON mv_daily_production_summary (organization_id, flock_id, date)
    """)

    # ── 2. Weekly KPI aggregates per flock ─────────────────────────────
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_kpi AS
        SELECT
            dp.organization_id,
            dp.flock_id,
            DATE_TRUNC('week', dp.date)::date AS week_start,
            COUNT(*)::int AS days_recorded,
            ROUND(AVG(
                CASE WHEN f.current_count > 0
                     THEN (dp.total_eggs::numeric / f.current_count) * 100
                     ELSE 0
                END
            )::numeric, 2) AS avg_hen_day_pct,
            SUM(dp.total_eggs)::bigint AS total_eggs,
            SUM(COALESCE(dp.broken, 0))::int AS total_broken,
            SUM(COALESCE(dp.deaths, 0))::int AS total_mortality,
            ROUND(AVG(dp.egg_mass_g)::numeric, 1) AS avg_egg_mass_g
        FROM daily_production dp
        JOIN flocks f ON f.id = dp.flock_id
        GROUP BY dp.organization_id, dp.flock_id, DATE_TRUNC('week', dp.date)
        ORDER BY dp.organization_id, dp.flock_id, week_start
        WITH DATA
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_weekly_kpi_org_flock_week
        ON mv_weekly_kpi (organization_id, flock_id, week_start)
    """)

    # ── 3. Monthly cost summary per flock ──────────────────────────────
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_costs AS
        SELECT
            sub.organization_id,
            sub.flock_id,
            sub.month_start,
            sub.total_feed_kg,
            COALESCE((
                SELECT ROUND((
                    CASE WHEN SUM(fp2.kg) > 0
                         THEN SUM(fp2.total_cost) / SUM(fp2.kg)
                         ELSE 0
                    END)::numeric, 4)
                FROM feed_purchases fp2
                WHERE fp2.organization_id = sub.organization_id
            ), 0) AS avg_feed_price_per_kg,
            COALESCE((
                SELECT SUM(v.cost) FROM vaccines v
                WHERE v.flock_id = sub.flock_id
                  AND v.organization_id = sub.organization_id
                  AND DATE_TRUNC('month', v.date) = sub.month_start
                  AND v.cost IS NOT NULL
            ), 0)::numeric(12,2) AS vaccine_cost,
            COALESCE((
                SELECT SUM(m.cost) FROM medications m
                WHERE m.flock_id = sub.flock_id
                  AND m.organization_id = sub.organization_id
                  AND DATE_TRUNC('month', m.date) = sub.month_start
                  AND m.cost IS NOT NULL
            ), 0)::numeric(12,2) AS medication_cost
        FROM (
            SELECT
                fc.organization_id,
                fc.flock_id,
                DATE_TRUNC('month', fc.date)::date AS month_start,
                SUM(fc.feed_kg)::numeric(12,2) AS total_feed_kg
            FROM feed_consumption fc
            GROUP BY fc.organization_id, fc.flock_id, DATE_TRUNC('month', fc.date)
        ) sub
        ORDER BY sub.organization_id, sub.flock_id, sub.month_start
        WITH DATA
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_costs_org_flock_month
        ON mv_monthly_costs (organization_id, flock_id, month_start)
    """)

    # ── 4. Organization-wide production trends (daily) ─────────────────
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_production_trends AS
        SELECT
            dp.organization_id,
            dp.date,
            COUNT(DISTINCT dp.flock_id)::int AS active_flocks,
            SUM(dp.total_eggs)::bigint AS total_eggs,
            SUM(COALESCE(dp.broken, 0))::int AS total_broken,
            SUM(COALESCE(dp.deaths, 0))::int AS total_mortality,
            ROUND(AVG(dp.egg_mass_g)::numeric, 1) AS avg_egg_mass_g
        FROM daily_production dp
        GROUP BY dp.organization_id, dp.date
        ORDER BY dp.organization_id, dp.date
        WITH DATA
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_trends_org_date
        ON mv_org_production_trends (organization_id, date)
    """)

    # ── 5. Feed conversion ratio (FCR) per flock ──────────────────────
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_flock_fcr AS
        SELECT
            sub.organization_id,
            sub.flock_id,
            sub.week_start,
            sub.feed_kg,
            COALESCE((
                SELECT SUM(dp.total_eggs * COALESCE(dp.egg_mass_g, 60.0) / 1000.0)
                FROM daily_production dp
                WHERE dp.flock_id = sub.flock_id
                  AND dp.organization_id = sub.organization_id
                  AND DATE_TRUNC('week', dp.date) = sub.week_start
            ), 0)::numeric(12,2) AS egg_mass_kg,
            CASE
                WHEN COALESCE((
                    SELECT SUM(dp.total_eggs * COALESCE(dp.egg_mass_g, 60.0) / 1000.0)
                    FROM daily_production dp
                    WHERE dp.flock_id = sub.flock_id
                      AND dp.organization_id = sub.organization_id
                      AND DATE_TRUNC('week', dp.date) = sub.week_start
                ), 0) > 0
                THEN ROUND((
                    sub.feed_kg / (
                        SELECT SUM(dp.total_eggs * COALESCE(dp.egg_mass_g, 60.0) / 1000.0)
                        FROM daily_production dp
                        WHERE dp.flock_id = sub.flock_id
                          AND dp.organization_id = sub.organization_id
                          AND DATE_TRUNC('week', dp.date) = sub.week_start
                    ))::numeric, 3)
                ELSE NULL
            END AS fcr
        FROM (
            SELECT
                fc.organization_id,
                fc.flock_id,
                DATE_TRUNC('week', fc.date)::date AS week_start,
                SUM(fc.feed_kg)::numeric(12,2) AS feed_kg
            FROM feed_consumption fc
            GROUP BY fc.organization_id, fc.flock_id, DATE_TRUNC('week', fc.date)
        ) sub
        ORDER BY sub.organization_id, sub.flock_id, sub.week_start
        WITH DATA
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_flock_fcr_org_flock_week
        ON mv_flock_fcr (organization_id, flock_id, week_start)
    """)


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_flock_fcr CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_org_production_trends CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_monthly_costs CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_weekly_kpi CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_daily_production_summary CASCADE")
