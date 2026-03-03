/**
 * EGGlogU Enterprise — k6 Load Test Suite
 * Tests: Authentication flow, CRUD operations, sync, analytics, health checks
 *
 * Run: k6 run k6-load-test.js --env BASE_URL=http://localhost:8000
 * With report: k6 run k6-load-test.js --out json=results.json
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const authLatency = new Trend('auth_latency', true);
const crudLatency = new Trend('crud_latency', true);
const syncLatency = new Trend('sync_latency', true);
const analyticsLatency = new Trend('analytics_latency', true);
const healthLatency = new Trend('health_latency', true);
const errorRate = new Rate('error_rate');
const requestCount = new Counter('total_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;
const TEST_EMAIL = __ENV.TEST_EMAIL || `loadtest_${__VU}_${Date.now()}@test.egglogu.com`;
const TEST_PASS = __ENV.TEST_PASS || 'LoadTest2026!Secure';

export const options = {
  scenarios: {
    // Smoke test — basic sanity check
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },
    // Load test — normal production load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // ramp up
        { duration: '5m', target: 50 },   // sustain
        { duration: '2m', target: 100 },  // push higher
        { duration: '5m', target: 100 },  // sustain
        { duration: '2m', target: 0 },    // ramp down
      ],
      startTime: '30s',
      tags: { scenario: 'load' },
    },
    // Stress test — beyond normal capacity
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 500 },
        { duration: '3m', target: 500 },
        { duration: '2m', target: 0 },
      ],
      startTime: '17m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: ['p(50)<200', 'p(95)<500', 'p(99)<2000'],
    error_rate: ['rate<0.05'],       // <5% errors
    auth_latency: ['p(95)<1000'],    // auth <1s at p95
    crud_latency: ['p(95)<500'],     // CRUD <500ms at p95
    health_latency: ['p(99)<100'],   // health <100ms at p99
  },
};

// Shared auth state per VU
let accessToken = null;
let refreshToken = null;
let farmId = null;
let flockId = null;

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`;
  return h;
}

function checkResponse(res, name) {
  const ok = check(res, {
    [`${name} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} has body`]: (r) => r.body && r.body.length > 0,
  });
  errorRate.add(!ok);
  requestCount.add(1);
  return ok;
}

// ──── SETUP: Create test user once ────
export function setup() {
  // Register test user
  const regPayload = JSON.stringify({
    email: `loadtest_setup_${Date.now()}@test.egglogu.com`,
    password: TEST_PASS,
    full_name: 'k6 Load Test User',
    organization_name: 'k6 Test Org',
  });

  const regRes = http.post(`${API}/auth/register`, regPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  // Login (even if registration fails, try login)
  const loginPayload = JSON.stringify({
    email: regRes.status === 201 ? JSON.parse(regRes.body).email : `loadtest_setup_${Date.now()}@test.egglogu.com`,
    password: TEST_PASS,
  });

  const loginRes = http.post(`${API}/auth/login`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    };
  }

  return { access_token: null, refresh_token: null };
}

// ──── MAIN TEST FLOW ────
export default function (data) {
  // Use setup tokens or authenticate per VU
  if (data && data.access_token) {
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
  }

  group('Health Checks', () => {
    // Liveness
    let res = http.get(`${API}/health/live`);
    healthLatency.add(res.timings.duration);
    checkResponse(res, 'liveness');

    // Readiness
    res = http.get(`${API}/health/ready`);
    healthLatency.add(res.timings.duration);
    checkResponse(res, 'readiness');
  });

  group('Authentication', () => {
    // Login
    const loginPayload = JSON.stringify({
      email: `loadtest_vu${__VU}@test.egglogu.com`,
      password: TEST_PASS,
    });
    const res = http.post(`${API}/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });
    authLatency.add(res.timings.duration);

    if (res.status === 200) {
      const body = JSON.parse(res.body);
      accessToken = body.access_token;
      refreshToken = body.refresh_token;
    }
    requestCount.add(1);
  });

  if (!accessToken) {
    sleep(1);
    return; // Can't proceed without auth
  }

  group('Farm CRUD', () => {
    // List farms
    let res = http.get(`${API}/farms`, { headers: headers() });
    crudLatency.add(res.timings.duration);
    checkResponse(res, 'list-farms');

    // Create farm
    const farmPayload = JSON.stringify({
      name: `LoadTest Farm ${__VU}-${__ITER}`,
      location: 'Test Location',
      capacity: 5000,
    });
    res = http.post(`${API}/farms`, farmPayload, { headers: headers() });
    crudLatency.add(res.timings.duration);
    if (res.status === 201 || res.status === 200) {
      const body = JSON.parse(res.body);
      farmId = body.id;
    }
    requestCount.add(1);
  });

  group('Flock Operations', () => {
    // List flocks
    let res = http.get(`${API}/flocks`, { headers: headers() });
    crudLatency.add(res.timings.duration);
    checkResponse(res, 'list-flocks');

    // Create flock
    if (farmId) {
      const flockPayload = JSON.stringify({
        name: `Test Flock ${__VU}-${__ITER}`,
        breed: 'Hy-Line Brown',
        initial_count: 1000,
        birth_date: '2025-01-15',
        farm_id: farmId,
      });
      res = http.post(`${API}/flocks`, flockPayload, { headers: headers() });
      crudLatency.add(res.timings.duration);
      if (res.status === 201 || res.status === 200) {
        const body = JSON.parse(res.body);
        flockId = body.id;
      }
      requestCount.add(1);
    }
  });

  group('Production Records', () => {
    // List production
    let res = http.get(`${API}/production`, { headers: headers() });
    crudLatency.add(res.timings.duration);
    checkResponse(res, 'list-production');

    // Create production record
    if (flockId) {
      const prodPayload = JSON.stringify({
        flock_id: flockId,
        date: new Date().toISOString().substring(0, 10),
        eggs_collected: Math.floor(Math.random() * 900) + 100,
        broken_eggs: Math.floor(Math.random() * 10),
        deaths: Math.floor(Math.random() * 3),
      });
      res = http.post(`${API}/production`, prodPayload, { headers: headers() });
      crudLatency.add(res.timings.duration);
      requestCount.add(1);
    }
  });

  group('Sync Endpoint', () => {
    const syncPayload = JSON.stringify({
      last_synced_at: new Date(Date.now() - 3600000).toISOString(),
      changes: {
        flocks: [],
        daily_production: [],
        vaccines: [],
      },
    });
    const res = http.post(`${API}/sync`, syncPayload, { headers: headers() });
    syncLatency.add(res.timings.duration);
    checkResponse(res, 'sync');
  });

  group('Analytics', () => {
    // Production analytics
    let res = http.get(`${API}/analytics/production-trends?days=30`, { headers: headers() });
    analyticsLatency.add(res.timings.duration);
    checkResponse(res, 'analytics-trends');

    // Financial summary
    res = http.get(`${API}/analytics/financial-summary?days=30`, { headers: headers() });
    analyticsLatency.add(res.timings.duration);
    checkResponse(res, 'analytics-financial');
  });

  group('Support FAQ (Public)', () => {
    const res = http.get(`${API}/support/faq`);
    crudLatency.add(res.timings.duration);
    checkResponse(res, 'faq');
  });

  group('Token Refresh', () => {
    if (refreshToken) {
      const res = http.post(`${API}/auth/refresh`, JSON.stringify({
        refresh_token: refreshToken,
      }), { headers: { 'Content-Type': 'application/json' } });
      authLatency.add(res.timings.duration);
      if (res.status === 200) {
        const body = JSON.parse(res.body);
        accessToken = body.access_token;
        refreshToken = body.refresh_token;
      }
      requestCount.add(1);
    }
  });

  sleep(Math.random() * 2 + 0.5); // Think time 0.5-2.5s
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'k6-load-test',
    metrics: {
      http_req_duration_p50: data.metrics.http_req_duration?.values?.['p(50)'],
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'],
      http_req_duration_p99: data.metrics.http_req_duration?.values?.['p(99)'],
      http_reqs_rate: data.metrics.http_reqs?.values?.rate,
      error_rate: data.metrics.error_rate?.values?.rate,
      total_requests: data.metrics.total_requests?.values?.count,
      auth_p95: data.metrics.auth_latency?.values?.['p(95)'],
      crud_p95: data.metrics.crud_latency?.values?.['p(95)'],
      sync_p95: data.metrics.sync_latency?.values?.['p(95)'],
      health_p99: data.metrics.health_latency?.values?.['p(99)'],
    },
    thresholds: Object.entries(data.metrics).reduce((acc, [key, val]) => {
      if (val.thresholds) acc[key] = val.thresholds;
      return acc;
    }, {}),
  };

  return {
    'stdout': JSON.stringify(summary, null, 2) + '\n',
    'results/load-test-results.json': JSON.stringify(summary, null, 2),
  };
}
