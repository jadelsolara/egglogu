/**
 * EGGlogU Enterprise — k6 Spike Test
 * Simulates sudden traffic spikes (e.g., morning shift start, breaking news)
 *
 * Run: k6 run k6-spike-test.js --env BASE_URL=http://localhost:8000
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const spikeLatency = new Trend('spike_latency', true);
const errorRate = new Rate('error_rate');
const recoveryTime = new Trend('recovery_time', true);

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API = `${BASE_URL}/api/v1`;

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },    // warm up
        { duration: '30s', target: 10 },   // baseline
        { duration: '10s', target: 1000 }, // SPIKE! 100x traffic
        { duration: '2m', target: 1000 },  // sustain spike
        { duration: '10s', target: 10 },   // instant drop
        { duration: '2m', target: 10 },    // recovery period
        { duration: '1m', target: 0 },     // wind down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],   // Relaxed during spike
    error_rate: ['rate<0.15'],           // Allow up to 15% errors during spike
    spike_latency: ['p(50)<1000'],
  },
};

export default function () {
  group('Spike — Health', () => {
    const res = http.get(`${BASE_URL}/health`);
    spikeLatency.add(res.timings.duration);
    const ok = check(res, { 'health 200': (r) => r.status === 200 });
    errorRate.add(!ok);
  });

  group('Spike — Public FAQ', () => {
    const res = http.get(`${API}/support/faq`);
    spikeLatency.add(res.timings.duration);
    const ok = check(res, { 'faq 200': (r) => r.status === 200 });
    errorRate.add(!ok);
  });

  group('Spike — Auth', () => {
    const res = http.post(`${API}/auth/login`, JSON.stringify({
      email: `spike_vu${__VU}@test.egglogu.com`,
      password: 'SpikeTest2026!',
    }), { headers: { 'Content-Type': 'application/json' } });
    spikeLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200 && res.status !== 401);
  });

  group('Spike — Pricing (Public)', () => {
    const res = http.get(`${API}/billing/pricing`);
    spikeLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200);
  });

  group('Spike — Lead Capture', () => {
    const res = http.post(`${BASE_URL}/api/leads`, JSON.stringify({
      email: `spike_lead_${__VU}_${__ITER}@test.com`,
      name: 'Spike Test Lead',
      farm_size: '5000',
      country: 'CL',
    }), { headers: { 'Content-Type': 'application/json' } });
    spikeLatency.add(res.timings.duration);
    errorRate.add(res.status !== 200 && res.status !== 201);
  });

  sleep(Math.random() * 0.5); // Minimal think time during spike
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify({
      test: 'spike-test',
      timestamp: new Date().toISOString(),
      peak_vus: 1000,
      p50_ms: data.metrics.spike_latency?.values?.['p(50)'],
      p95_ms: data.metrics.spike_latency?.values?.['p(95)'],
      p99_ms: data.metrics.spike_latency?.values?.['p(99)'],
      error_pct: (data.metrics.error_rate?.values?.rate * 100).toFixed(2) + '%',
      total_reqs: data.metrics.http_reqs?.values?.count,
      rps: data.metrics.http_reqs?.values?.rate?.toFixed(1),
    }, null, 2) + '\n',
  };
}
