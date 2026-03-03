/**
 * EGGlogU Enterprise — k6 Soak Test (Endurance)
 * Runs extended load (4-8h) to detect memory leaks, connection pool exhaustion,
 * DB connection leaks, and gradual performance degradation.
 *
 * Run: k6 run k6-soak-test.js --env BASE_URL=http://localhost:8000 --env DURATION=4h
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const soakLatency = new Trend('soak_latency', true);
const errorRate = new Rate('error_rate');
const degradation = new Gauge('degradation_factor');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;
const DURATION = __ENV.DURATION || '4h';
const STEADY_VUS = parseInt(__ENV.VUS || '50');

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: STEADY_VUS },  // ramp up
        { duration: DURATION, target: STEADY_VUS }, // sustain
        { duration: '5m', target: 0 },            // ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    error_rate: ['rate<0.02'],       // <2% errors over long run
    soak_latency: ['p(95)<500'],
  },
};

// Track baseline latency for degradation detection
let baselineLatency = null;
let sampleCount = 0;

export default function () {
  // Health check — monitors for connection pool exhaustion
  group('Soak — Health Ready', () => {
    const res = http.get(`${API}/health/ready`);
    soakLatency.add(res.timings.duration);
    const ok = check(res, {
      'ready 200': (r) => r.status === 200,
      'ready <200ms': (r) => r.timings.duration < 200,
    });
    errorRate.add(!ok);

    // Track degradation
    sampleCount++;
    if (sampleCount <= 10) {
      baselineLatency = baselineLatency
        ? (baselineLatency + res.timings.duration) / 2
        : res.timings.duration;
    } else if (baselineLatency) {
      degradation.add(res.timings.duration / baselineLatency);
    }
  });

  // Authenticated CRUD cycle — tests DB connection pool under sustained load
  group('Soak — Auth + CRUD Cycle', () => {
    // Login
    const loginRes = http.post(`${API}/auth/login`, JSON.stringify({
      email: `soak_vu${__VU}@test.egglogu.com`,
      password: 'SoakTest2026!Secure',
    }), { headers: { 'Content-Type': 'application/json' } });

    if (loginRes.status === 200) {
      const body = JSON.parse(loginRes.body);
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.access_token}`,
      };

      // Read farms
      const farmsRes = http.get(`${API}/farms`, { headers: authHeaders });
      soakLatency.add(farmsRes.timings.duration);
      check(farmsRes, { 'farms ok': (r) => r.status === 200 });

      // Read flocks
      const flocksRes = http.get(`${API}/flocks`, { headers: authHeaders });
      soakLatency.add(flocksRes.timings.duration);
      check(flocksRes, { 'flocks ok': (r) => r.status === 200 });

      // Read production
      const prodRes = http.get(`${API}/production`, { headers: authHeaders });
      soakLatency.add(prodRes.timings.duration);
      check(prodRes, { 'production ok': (r) => r.status === 200 });

      // Sync cycle
      const syncRes = http.post(`${API}/sync`, JSON.stringify({
        last_synced_at: new Date(Date.now() - 60000).toISOString(),
        changes: { flocks: [], daily_production: [] },
      }), { headers: authHeaders });
      soakLatency.add(syncRes.timings.duration);
      check(syncRes, { 'sync ok': (r) => r.status >= 200 && r.status < 300 });

      // Refresh token
      const refreshRes = http.post(`${API}/auth/refresh`, JSON.stringify({
        refresh_token: body.refresh_token,
      }), { headers: { 'Content-Type': 'application/json' } });
      soakLatency.add(refreshRes.timings.duration);
    }

    soakLatency.add(loginRes.timings.duration);
    errorRate.add(loginRes.status !== 200 && loginRes.status !== 401);
  });

  // Analytics — tests read replica and materialized views
  group('Soak — Analytics', () => {
    const loginRes = http.post(`${API}/auth/login`, JSON.stringify({
      email: `soak_vu${__VU}@test.egglogu.com`,
      password: 'SoakTest2026!Secure',
    }), { headers: { 'Content-Type': 'application/json' } });

    if (loginRes.status === 200) {
      const body = JSON.parse(loginRes.body);
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.access_token}`,
      };

      const res = http.get(`${API}/analytics/production-trends?days=30`, {
        headers: authHeaders,
      });
      soakLatency.add(res.timings.duration);
      errorRate.add(res.status !== 200);
    }
  });

  sleep(Math.random() * 3 + 1); // 1-4s think time (realistic for soak)
}

export function handleSummary(data) {
  const degradationFactor = data.metrics.degradation_factor?.values?.value || 1;
  const leaked = degradationFactor > 2.0; // >2x baseline = probable leak

  return {
    'stdout': JSON.stringify({
      test: 'soak-test',
      timestamp: new Date().toISOString(),
      duration: DURATION,
      steady_vus: STEADY_VUS,
      p50_ms: data.metrics.soak_latency?.values?.['p(50)'],
      p95_ms: data.metrics.soak_latency?.values?.['p(95)'],
      p99_ms: data.metrics.soak_latency?.values?.['p(99)'],
      error_pct: ((data.metrics.error_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
      total_reqs: data.metrics.http_reqs?.values?.count,
      degradation_factor: degradationFactor.toFixed(2),
      memory_leak_suspected: leaked,
      verdict: leaked ? 'FAIL — Performance degraded >2x' : 'PASS — Stable performance',
    }, null, 2) + '\n',
  };
}
