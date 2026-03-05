#!/usr/bin/env python3
"""
EGGlogU TOTAL Stress Test — Every endpoint, every flow, every edge case.

Usage:
    python3 stress_test_total.py --url https://api.egglogu.com --scenario smoke
    python3 stress_test_total.py --url http://localhost:8000 --scenario full --vus 100
    python3 stress_test_total.py --url https://api.egglogu.com --scenario stress --vus 500

Scenarios:
    smoke   — 5 VUs,  15s  (quick sanity check)
    load    — 50 VUs, 30s  (normal production load)
    stress  — 200 VUs, 60s (2x expected peak)
    spike   — 0→500 VUs in 5s burst, 30s sustain
    soak    — 30 VUs, 300s (5 min endurance)
    full    — All of the above sequentially
"""

import argparse
import asyncio
import json
import os
import random
import statistics
import string
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import urljoin

LOADTEST_SECRET = os.environ.get("LOADTEST_SECRET", "")


# ─── Data Classes ──────────────────────────────────────────────────

@dataclass
class RequestResult:
    endpoint: str
    method: str
    status: int
    duration_ms: float
    error: str | None = None


@dataclass
class ScenarioResults:
    name: str
    results: list[RequestResult] = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def total(self): return len(self.results)

    @property
    def successes(self): return sum(1 for r in self.results if 200 <= r.status < 500)

    @property
    def server_errors(self): return sum(1 for r in self.results if r.status >= 500)

    @property
    def timeouts(self): return sum(1 for r in self.results if r.error)

    @property
    def error_rate(self): return (self.server_errors + self.timeouts) / max(self.total, 1)

    @property
    def durations(self): return sorted([r.duration_ms for r in self.results if not r.error])

    @property
    def p50(self):
        d = self.durations
        return d[len(d) // 2] if d else 0

    @property
    def p95(self):
        d = self.durations
        return d[int(len(d) * 0.95)] if d else 0

    @property
    def p99(self):
        d = self.durations
        return d[int(len(d) * 0.99)] if d else 0

    @property
    def avg(self):
        d = self.durations
        return statistics.mean(d) if d else 0

    @property
    def rps(self):
        elapsed = self.end_time - self.start_time
        return self.total / max(elapsed, 0.001)

    def by_endpoint(self):
        """Group results by endpoint for per-route analysis."""
        groups = {}
        for r in self.results:
            key = f"{r.method} {r.endpoint}"
            groups.setdefault(key, []).append(r)
        return groups


# ─── HTTP Client ───────────────────────────────────────────────────

async def http_request(
    url: str, method: str = "GET", body: str | None = None,
    headers: dict | None = None, timeout: int = 15,
) -> RequestResult:
    start = time.monotonic()
    endpoint = url.split("/api/")[-1] if "/api/" in url else url.split("/")[-1]
    try:
        cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", method]
        if headers:
            for k, v in headers.items():
                cmd.extend(["-H", f"{k}: {v}"])
        if body:
            cmd.extend(["-H", "Content-Type: application/json", "-d", body])
        cmd.extend(["--max-time", str(timeout), url])

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        ms = (time.monotonic() - start) * 1000
        status = int(stdout.decode().strip()) if stdout else 0
        return RequestResult(endpoint=endpoint, method=method, status=status, duration_ms=ms)
    except Exception as e:
        ms = (time.monotonic() - start) * 1000
        return RequestResult(endpoint=endpoint, method=method, status=0, duration_ms=ms, error=str(e))


# ─── Auth Helper ───────────────────────────────────────────────────

async def register_and_login(base_url: str) -> dict | None:
    """Create a test user and get auth tokens."""
    rnd = ''.join(random.choices(string.ascii_lowercase, k=8))
    email = f"stress_{rnd}@test.egglogu.com"
    password = f"StressTest_{rnd}_123!"

    reg_payload = json.dumps({
        "email": email,
        "password": password,
        "full_name": f"Stress User {rnd}",
        "organization_name": f"StressOrg_{rnd}",
    })

    # Fast path: loadtest endpoint (auto-verified, returns tokens)
    if LOADTEST_SECRET:
        cmd = [
            "curl", "-s", "-X", "POST",
            "-H", "Content-Type: application/json",
            "-H", f"X-Loadtest-Secret: {LOADTEST_SECRET}",
            "-d", reg_payload,
            "--max-time", "10",
            urljoin(base_url, "/api/v1/auth/loadtest-register"),
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        try:
            data = json.loads(stdout.decode())
            if "access_token" in data:
                return {
                    "Authorization": f"Bearer {data['access_token']}",
                    "Content-Type": "application/json",
                }
        except Exception:
            pass
        return None

    # Fallback: normal register + login
    result = await http_request(
        urljoin(base_url, "/api/v1/auth/register"), "POST", reg_payload,
    )
    if result.status not in (200, 201):
        return None

    body = json.dumps({"email": email, "password": password})
    cmd = [
        "curl", "-s", "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", body,
        "--max-time", "10",
        urljoin(base_url, "/api/v1/auth/login"),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        data = json.loads(stdout.decode())
        return {
            "Authorization": f"Bearer {data['access_token']}",
            "Content-Type": "application/json",
        }
    except Exception:
        return None


# ─── Endpoint Definitions ─────────────────────────────────────────

def get_all_endpoints(farm_id: str = None, flock_id: str = None):
    """Return every testable endpoint with method, path, body, auth_required."""
    fake_uuid = str(uuid.uuid4())
    fid = farm_id or fake_uuid
    flk = flock_id or fake_uuid

    return [
        # ── Public / Health ──
        ("GET", "/api/health", None, False),
        ("GET", "/api/ping", None, False),

        # ── Auth ──
        ("POST", "/api/v1/auth/login", json.dumps({"email": "x@x.com", "password": "x"}), False),
        ("POST", "/api/v1/auth/forgot-password", json.dumps({"email": "x@test.com"}), False),

        # ── Farms ──
        ("GET", "/api/v1/farms/", None, True),
        ("POST", "/api/v1/farms/", json.dumps({"name": "StressFarm"}), True),

        # ── Flocks ──
        ("GET", "/api/v1/flocks/", None, True),

        # ── Production ──
        ("GET", "/api/v1/production/", None, True),

        # ── Health (vaccines, meds, outbreaks, stress events) ──
        ("GET", "/api/v1/vaccines", None, True),
        ("GET", "/api/v1/medications", None, True),
        ("GET", "/api/v1/outbreaks", None, True),
        ("GET", "/api/v1/stress-events", None, True),

        # ── Feed ──
        ("GET", "/api/v1/feed/purchases", None, True),
        ("GET", "/api/v1/feed/consumption", None, True),

        # ── Clients ──
        ("GET", "/api/v1/clients/", None, True),

        # ── Finance ──
        ("GET", "/api/v1/income", None, True),
        ("GET", "/api/v1/expenses", None, True),
        ("GET", "/api/v1/receivables", None, True),

        # ── Environment ──
        ("GET", "/api/v1/environment", None, True),

        # ── Operations ──
        ("GET", "/api/v1/checklist", None, True),
        ("GET", "/api/v1/logbook", None, True),
        ("GET", "/api/v1/personnel", None, True),

        # ── Sync ──
        ("POST", "/api/v1/sync/", json.dumps({"last_synced_at": None, "data": {}}), True),

        # ── Biosecurity ──
        ("GET", "/api/v1/biosecurity/visitors", None, True),
        ("GET", "/api/v1/biosecurity/zones", None, True),
        ("GET", "/api/v1/biosecurity/protocols", None, True),

        # ── Traceability ──
        ("GET", "/api/v1/traceability/batches", None, True),

        # ── Planning ──
        ("GET", "/api/v1/planning/plans", None, True),

        # ── Support ──
        ("GET", "/api/v1/support/faq", None, False),
        ("GET", "/api/v1/support/tickets", None, True),

        # ── Billing ──
        ("GET", "/api/v1/billing/status", None, True),
        ("GET", "/api/v1/billing/pricing", None, False),

        # ── Audit ──
        ("GET", "/api/v1/audit/logs", None, True),

        # ── Analytics ──
        ("GET", "/api/v1/analytics/economics", None, True),

        # ── Leads (public) ──
        ("POST", "/api/leads/", json.dumps({
            "email": f"lead_{uuid.uuid4().hex[:6]}@test.com",
            "source": "stress_test",
        }), False),

        # ── Inventory ──
        ("GET", "/api/v1/inventory/stock", None, True),

        # ── Compliance ──
        ("GET", "/api/v1/compliance/certifications", None, True),

        # ── Grading ──
        ("GET", "/api/v1/grading/sessions", None, True),

        # ── Animal Welfare ──
        ("GET", "/api/v1/welfare", None, True),

        # ── Workflows ──
        ("GET", "/api/v1/workflows/rules", None, True),

        # ── Community ──
        ("GET", "/api/v1/community/threads", None, True),

        # ── Reports ──
        ("GET", "/api/v1/reports/schedules", None, True),

        # ── API Keys ──
        ("GET", "/api/v1/api-keys", None, True),
    ]


# ─── Virtual User Logic ───────────────────────────────────────────

async def virtual_user(
    vu_id: int, base_url: str, end_at: float,
    auth_headers: dict | None, results: ScenarioResults,
):
    """Simulate one virtual user hitting endpoints in rotation."""
    endpoints = get_all_endpoints()
    idx = vu_id % len(endpoints)  # stagger starting point

    while time.monotonic() < end_at:
        method, path, body, needs_auth = endpoints[idx % len(endpoints)]
        idx += 1

        headers = auth_headers if needs_auth and auth_headers else None
        if needs_auth and not headers:
            # Skip auth-required endpoints if we have no token
            continue

        url = urljoin(base_url, path)
        result = await http_request(url, method, body, headers)
        results.results.append(result)

        # Realistic pacing: 100-500ms between requests
        await asyncio.sleep(0.1 + random.random() * 0.4)


# ─── Scenario Runner ──────────────────────────────────────────────

async def run_scenario(
    base_url: str, vus: int, duration: int, name: str,
    auth_headers: dict | None = None, ramp_up: int = 0,
) -> ScenarioResults:
    results = ScenarioResults(name=name)
    results.start_time = time.monotonic()
    end_at = results.start_time + duration

    if ramp_up > 0:
        # Spike test: ramp up VUs gradually
        tasks = []
        for i in range(vus):
            delay = (ramp_up / vus) * i
            tasks.append(asyncio.create_task(_delayed_vu(
                delay, i, base_url, end_at, auth_headers, results,
            )))
        await asyncio.gather(*tasks)
    else:
        tasks = [
            asyncio.create_task(virtual_user(i, base_url, end_at, auth_headers, results))
            for i in range(vus)
        ]
        await asyncio.gather(*tasks)

    results.end_time = time.monotonic()
    return results


async def _delayed_vu(delay, vu_id, base_url, end_at, auth_headers, results):
    await asyncio.sleep(delay)
    await virtual_user(vu_id, base_url, end_at, auth_headers, results)


# ─── Report ────────────────────────────────────────────────────────

SLA = {"p50_ms": 200, "p95_ms": 500, "p99_ms": 1000, "error_rate": 0.01}


def print_results(results: ScenarioResults):
    elapsed = results.end_time - results.start_time
    print(f"\n{'=' * 70}")
    print(f"  {results.name}")
    print(f"{'=' * 70}")
    print(f"  Duration:      {elapsed:.1f}s")
    print(f"  Total Requests:{results.total}")
    print(f"  Throughput:    {results.rps:.1f} req/s")
    print(f"  Success:       {results.successes} ({(1 - results.error_rate) * 100:.1f}%)")
    print(f"  Server Errors: {results.server_errors}")
    print(f"  Timeouts:      {results.timeouts}")
    print(f"  Error Rate:    {results.error_rate * 100:.2f}%")
    print(f"  Latency:")
    print(f"    avg: {results.avg:.0f}ms | p50: {results.p50:.0f}ms | p95: {results.p95:.0f}ms | p99: {results.p99:.0f}ms")

    # Per-endpoint breakdown
    groups = results.by_endpoint()
    print(f"\n  Per-Endpoint Breakdown ({len(groups)} endpoints):")
    print(f"  {'Endpoint':<45} {'Reqs':>5} {'Avg':>6} {'p95':>6} {'Err%':>6}")
    print(f"  {'-' * 68}")
    for key in sorted(groups.keys()):
        reqs = groups[key]
        durations = sorted([r.duration_ms for r in reqs if not r.error])
        errs = sum(1 for r in reqs if r.status >= 500 or r.error)
        avg = statistics.mean(durations) if durations else 0
        p95 = durations[int(len(durations) * 0.95)] if durations else 0
        err_pct = errs / len(reqs) * 100
        print(f"  {key:<45} {len(reqs):>5} {avg:>5.0f}ms {p95:>5.0f}ms {err_pct:>5.1f}%")

    # Status code distribution
    status_counts = {}
    for r in results.results:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1
    print(f"\n  Status Codes:")
    for s, c in sorted(status_counts.items()):
        print(f"    {s}: {c}")

    # SLA check
    print(f"\n  SLA Check (p50<{SLA['p50_ms']}ms, p95<{SLA['p95_ms']}ms, p99<{SLA['p99_ms']}ms, err<{SLA['error_rate']*100}%):")
    checks = [
        ("p50", results.p50, SLA["p50_ms"]),
        ("p95", results.p95, SLA["p95_ms"]),
        ("p99", results.p99, SLA["p99_ms"]),
        ("error_rate", results.error_rate * 100, SLA["error_rate"] * 100),
    ]
    all_pass = True
    for name, val, threshold in checks:
        ok = val <= threshold
        if not ok:
            all_pass = False
        marker = "PASS" if ok else "FAIL"
        print(f"    {name}: {val:.1f} {'ms' if 'p' in name else '%'} [{marker}]")

    verdict = "PASS" if all_pass else "FAIL"
    print(f"\n  VERDICT: {verdict}")
    print(f"{'=' * 70}\n")
    return all_pass


# ─── Main ──────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="EGGlogU Total Stress Test")
    parser.add_argument("--url", default="https://api.egglogu.com")
    parser.add_argument("--vus", type=int, default=50)
    parser.add_argument("--duration", type=int, default=30)
    parser.add_argument(
        "--scenario", choices=["smoke", "load", "stress", "spike", "soak", "full"],
        default="smoke",
    )
    parser.add_argument("--no-auth", action="store_true", help="Skip auth endpoints")
    args = parser.parse_args()

    print(f"\nEGGlogU TOTAL Stress Test")
    print(f"Target: {args.url}")
    print(f"Scenario: {args.scenario}")
    print(f"Endpoints: {len(get_all_endpoints())} total\n")

    # Get auth token for authenticated endpoints
    auth = None
    if not args.no_auth:
        print("  Registering test user...")
        auth = await register_and_login(args.url)
        if auth:
            print("  Auth token acquired.\n")
        else:
            print("  Auth failed — testing public endpoints only.\n")

    SCENARIOS = {
        "smoke": [
            (5, 15, "Smoke Test (5 VUs, 15s)", 0),
        ],
        "load": [
            (10, 15, "Warm-up (10 VUs)", 0),
            (50, 30, "Normal Load (50 VUs)", 0),
            (100, 30, "Peak Load (100 VUs)", 0),
        ],
        "stress": [
            (50, 15, "Warm-up", 0),
            (200, 30, "Stress (200 VUs)", 0),
            (500, 30, "Heavy Stress (500 VUs)", 0),
        ],
        "spike": [
            (50, 15, "Baseline (50 VUs)", 0),
            (500, 30, "Spike (0→500 in 5s)", 5),
            (50, 15, "Recovery (back to 50 VUs)", 0),
        ],
        "soak": [
            (30, 300, "Soak Test (30 VUs, 5 min)", 0),
        ],
        "full": [
            (5, 10, "1. Smoke (5 VUs)", 0),
            (50, 20, "2. Load (50 VUs)", 0),
            (100, 20, "3. Peak (100 VUs)", 0),
            (200, 20, "4. Stress (200 VUs)", 0),
            (500, 20, "5. Heavy (500 VUs)", 0),
            (500, 30, "6. Spike (0→500 in 5s)", 5),
            (50, 15, "7. Recovery", 0),
        ],
    }

    all_results = []
    all_pass = True
    for vus, dur, name, ramp in SCENARIOS[args.scenario]:
        print(f"  Running: {name}...")
        result = await run_scenario(args.url, vus, dur, name, auth, ramp)
        passed = print_results(result)
        all_results.append(result)
        if not passed:
            all_pass = False
        await asyncio.sleep(3)  # cool down

    # Save JSON report
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "target": args.url,
        "scenario": args.scenario,
        "endpoints_tested": len(get_all_endpoints()),
        "overall_pass": all_pass,
        "stages": [
            {
                "name": r.name,
                "requests": r.total,
                "rps": round(r.rps, 1),
                "avg_ms": round(r.avg),
                "p50_ms": round(r.p50),
                "p95_ms": round(r.p95),
                "p99_ms": round(r.p99),
                "error_rate": round(r.error_rate, 4),
                "server_errors": r.server_errors,
                "timeouts": r.timeouts,
            }
            for r in all_results
        ],
    }
    outfile = f"stress_results_{args.scenario}_{time.strftime('%Y%m%d_%H%M%S')}.json"
    with open(outfile, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {outfile}")
    print(f"Overall: {'ALL PASS' if all_pass else 'FAILURES DETECTED'}")


if __name__ == "__main__":
    asyncio.run(main())
