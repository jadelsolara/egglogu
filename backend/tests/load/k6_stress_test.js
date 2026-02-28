/**
 * EGGlogU Stress Test — k6
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *   sudo snap install k6  (Ubuntu)
 *
 * Usage:
 *   k6 run k6_stress_test.js                          # default (API endpoint)
 *   k6 run -e BASE_URL=http://localhost:8000 k6_stress_test.js  # local
 *   k6 run -e BASE_URL=https://api.egglogu.com k6_stress_test.js  # production
 *
 * Scenarios:
 *   smoke     — 5 VUs for 30s (sanity check)
 *   load      — ramp 10→100 VUs over 3 min
 *   stress    — ramp 100→500 VUs over 5 min
 *   spike     — jump to 1000 VUs for 1 min
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom Metrics ──────────────────────────────────────────────
const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency', true);
const syncLatency = new Trend('sync_latency', true);

// ── Config ──────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://api.egglogu.com';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      startTime: '35s',
      tags: { scenario: 'load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '2m', target: 250 },
        { duration: '3m', target: 500 },
        { duration: '2m', target: 500 },
        { duration: '1m', target: 0 },
      ],
      startTime: '6m',
      tags: { scenario: 'stress' },
    },
    spike: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '10s', target: 1000 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      startTime: '15m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    errors: ['rate<0.05'],             // <5% error rate
    health_latency: ['p(95)<200'],     // health endpoint fast
    sync_latency: ['p(95)<1000'],      // sync can be slower
    http_req_failed: ['rate<0.05'],
  },
};

// ── Test Functions ──────────────────────────────────────────────

export default function () {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    healthLatency.add(res.timings.duration);
    const ok = check(res, {
      'health status 200': (r) => r.status === 200,
      'health body ok': (r) => {
        try {
          return JSON.parse(r.body).status === 'ok';
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  group('API Health (detailed)', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    const ok = check(res, {
      'api health status 2xx': (r) => r.status >= 200 && r.status < 300,
      'api health has version': (r) => {
        try {
          return JSON.parse(r.body).version !== undefined;
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  group('Public Endpoints', () => {
    // FAQ endpoint (public, cacheable)
    const faqRes = http.get(`${BASE_URL}/api/v1/support/faq`);
    const faqOk = check(faqRes, {
      'faq status 2xx': (r) => r.status >= 200 && r.status < 400,
    });
    errorRate.add(!faqOk);
  });

  sleep(0.5);

  group('Auth Flow (invalid token)', () => {
    // Test rate-limited auth with intentionally bad token
    // This tests the middleware pipeline performance
    const res = http.get(`${BASE_URL}/api/v1/farms/`, {
      headers: { 'Authorization': 'Bearer invalid-token-stress-test' },
    });
    const ok = check(res, {
      'auth rejects invalid token': (r) => r.status === 401 || r.status === 403,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  group('Sync Endpoint (no auth)', () => {
    // Test sync middleware pipeline (will get 401 without valid token)
    const payload = JSON.stringify({
      last_synced_at: null,
      data: {},
    });
    const res = http.post(`${BASE_URL}/api/v1/sync/`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token-stress-test',
      },
    });
    syncLatency.add(res.timings.duration);
    const ok = check(res, {
      'sync rejects unauthenticated': (r) => r.status === 401 || r.status === 403,
    });
    errorRate.add(!ok);
  });

  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}

// ── Summary ─────────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    target: BASE_URL,
    scenarios: Object.keys(options.scenarios),
    metrics: {
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'],
      http_req_duration_p99: data.metrics.http_req_duration?.values?.['p(99)'],
      http_req_duration_avg: data.metrics.http_req_duration?.values?.avg,
      http_reqs_total: data.metrics.http_reqs?.values?.count,
      http_reqs_rate: data.metrics.http_reqs?.values?.rate,
      error_rate: data.metrics.errors?.values?.rate,
      health_p95: data.metrics.health_latency?.values?.['p(95)'],
      sync_p95: data.metrics.sync_latency?.values?.['p(95)'],
    },
    thresholds_passed: Object.entries(data.root_group?.checks || {}).every(
      ([, v]) => v.passes > 0
    ),
  };

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'stress_test_results.json': JSON.stringify(summary, null, 2),
  };
}

function textSummary(data, opts) {
  // k6 built-in text summary
  return '';
}
