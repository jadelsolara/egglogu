/**
 * EGGlogU Enterprise — k6 WebSocket Load Test
 * Tests concurrent WebSocket connections, message throughput, and reconnect behavior.
 *
 * Run: k6 run k6-websocket-test.js --env BASE_URL=ws://localhost:8000
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const wsConnectTime = new Trend('ws_connect_time', true);
const wsMessageLatency = new Trend('ws_message_latency', true);
const wsErrorRate = new Rate('ws_error_rate');
const wsMessages = new Counter('ws_messages_received');
const wsConnections = new Counter('ws_connections_total');

const HTTP_BASE = __ENV.BASE_URL || 'http://localhost:8000';
const WS_BASE = HTTP_BASE.replace('http://', 'ws://').replace('https://', 'wss://');
const API = `${HTTP_BASE}/api/v1`;

export const options = {
  scenarios: {
    // Gradual WebSocket connection ramp
    ws_connections: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },    // 50 concurrent WS connections
        { duration: '3m', target: 50 },    // sustain
        { duration: '1m', target: 200 },   // ramp to 200
        { duration: '3m', target: 200 },   // sustain
        { duration: '1m', target: 500 },   // ramp to 500
        { duration: '3m', target: 500 },   // sustain
        { duration: '1m', target: 0 },     // disconnect all
      ],
    },
  },
  thresholds: {
    ws_connect_time: ['p(95)<2000'],   // Connection <2s at p95
    ws_message_latency: ['p(95)<500'], // Messages <500ms at p95
    ws_error_rate: ['rate<0.10'],      // <10% connection errors
  },
};

export default function () {
  // First, authenticate to get a token for WebSocket
  const loginRes = http.post(`${API}/auth/login`, JSON.stringify({
    email: `ws_vu${__VU}@test.egglogu.com`,
    password: 'WsTest2026!Secure',
  }), { headers: { 'Content-Type': 'application/json' } });

  let token = '';
  if (loginRes.status === 200) {
    token = JSON.parse(loginRes.body).access_token;
  }

  // WebSocket connection with auth token
  const farmId = 'test-farm-001';
  const wsUrl = `${WS_BASE}/ws/dashboard/${farmId}?token=${token}`;

  const startTime = Date.now();
  const res = ws.connect(wsUrl, {}, function (socket) {
    wsConnections.add(1);
    wsConnectTime.add(Date.now() - startTime);

    socket.on('open', () => {
      // Send subscription message
      socket.send(JSON.stringify({
        type: 'subscribe',
        channels: ['production', 'health', 'environment'],
      }));
    });

    socket.on('message', (data) => {
      wsMessages.add(1);
      try {
        const msg = JSON.parse(data);
        if (msg.timestamp) {
          const latency = Date.now() - new Date(msg.timestamp).getTime();
          wsMessageLatency.add(Math.abs(latency));
        }

        check(msg, {
          'has type': (m) => m.type !== undefined,
          'valid JSON': () => true,
        });
      } catch (e) {
        // Non-JSON message (e.g., heartbeat ping)
        wsMessages.add(1);
      }
    });

    socket.on('error', (e) => {
      wsErrorRate.add(true);
    });

    socket.on('close', () => {
      // Normal close
    });

    // Keep connection alive for the test duration
    // Send heartbeat every 30s (matching server expectation)
    socket.setInterval(() => {
      socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
    }, 30000);

    // Stay connected for 60-120 seconds (simulating dashboard view)
    socket.setTimeout(() => {
      socket.close();
    }, Math.random() * 60000 + 60000);
  });

  const wsOk = check(res, {
    'ws status 101': (r) => r && r.status === 101,
  });
  wsErrorRate.add(!wsOk);

  sleep(Math.random() * 5 + 2); // Wait before reconnect
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify({
      test: 'websocket-test',
      timestamp: new Date().toISOString(),
      total_connections: data.metrics.ws_connections_total?.values?.count,
      total_messages: data.metrics.ws_messages_received?.values?.count,
      connect_p95_ms: data.metrics.ws_connect_time?.values?.['p(95)'],
      message_p95_ms: data.metrics.ws_message_latency?.values?.['p(95)'],
      error_pct: ((data.metrics.ws_error_rate?.values?.rate || 0) * 100).toFixed(2) + '%',
      verdict: (data.metrics.ws_error_rate?.values?.rate || 0) < 0.1 ? 'PASS' : 'FAIL',
    }, null, 2) + '\n',
  };
}
