-- EGGlogU Enterprise — pgbench Custom Script for RLS Performance Testing
-- Tests PostgreSQL Row-Level Security overhead on real workloads
--
-- Setup: pgbench -i -s 10 egglogu
-- Run:   pgbench -c 50 -j 4 -T 300 -f pgbench-rls.sql egglogu
-- Compare without RLS: ALTER TABLE daily_production DISABLE ROW LEVEL SECURITY;
--                      pgbench -c 50 -j 4 -T 300 -f pgbench-rls.sql egglogu

-- Set tenant context (simulates middleware SET LOCAL per request)
SET LOCAL app.current_org = :'org_id';

-- 1. List flocks (common query)
SELECT id, name, breed, initial_count, status
FROM flocks
WHERE organization_id = current_setting('app.current_org')::uuid
ORDER BY created_at DESC
LIMIT 50;

-- 2. Production records with aggregation (dashboard KPI)
SELECT
  date,
  SUM(eggs_collected) as total_eggs,
  SUM(broken_eggs) as total_broken,
  SUM(deaths) as total_deaths,
  AVG(eggs_collected) as avg_eggs
FROM daily_production
WHERE organization_id = current_setting('app.current_org')::uuid
  AND date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY date
ORDER BY date DESC;

-- 3. Finance summary (heavy aggregation)
SELECT
  EXTRACT(MONTH FROM date) as month,
  SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
  SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
FROM (
  SELECT date, 'income' as type, amount FROM incomes
  WHERE organization_id = current_setting('app.current_org')::uuid
  UNION ALL
  SELECT date, 'expense' as type, amount FROM expenses
  WHERE organization_id = current_setting('app.current_org')::uuid
) combined
GROUP BY EXTRACT(MONTH FROM date)
ORDER BY month;

-- 4. Health records join (cross-table query)
SELECT v.id, v.vaccine_name, v.scheduled_date, v.applied_date,
       f.name as flock_name
FROM vaccines v
JOIN flocks f ON f.id = v.flock_id
WHERE v.organization_id = current_setting('app.current_org')::uuid
  AND v.scheduled_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY v.scheduled_date DESC
LIMIT 100;

-- 5. Insert production record (write path)
INSERT INTO daily_production (
  id, organization_id, flock_id, date,
  eggs_collected, broken_eggs, deaths, notes, created_at
) VALUES (
  gen_random_uuid(),
  current_setting('app.current_org')::uuid,
  (SELECT id FROM flocks WHERE organization_id = current_setting('app.current_org')::uuid LIMIT 1),
  CURRENT_DATE,
  floor(random() * 900 + 100)::int,
  floor(random() * 10)::int,
  floor(random() * 3)::int,
  'pgbench test record',
  NOW()
);

-- 6. Audit log insert (immutable append, measures hash-chain overhead)
INSERT INTO audit_log (
  id, organization_id, user_id, action, table_name,
  record_id, new_values, ip_address, timestamp, hash, prev_hash
) VALUES (
  gen_random_uuid(),
  current_setting('app.current_org')::uuid,
  gen_random_uuid(),
  'INSERT',
  'daily_production',
  gen_random_uuid(),
  '{"eggs": 500}',
  '10.0.0.1',
  NOW(),
  encode(sha256(('test' || NOW()::text)::bytea), 'hex'),
  'prev_hash_placeholder'
);
