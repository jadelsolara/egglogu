#!/usr/bin/env python3
"""
EGGlogU Stress Test — Python (no external deps needed)

Usage:
    python3 stress_test.py                                  # default: api.egglogu.com
    python3 stress_test.py --url http://localhost:8000       # local
    python3 stress_test.py --url https://api.egglogu.com --vus 200 --duration 60

VU = Virtual Users (concurrent connections)
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin

# Use stdlib only — no pip install needed
import ssl
from http.client import HTTPSConnection, HTTPConnection
from urllib.parse import urlparse


@dataclass
class RequestResult:
    url: str
    status: int
    duration_ms: float
    error: str | None = None


@dataclass
class TestResults:
    name: str
    results: list[RequestResult] = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def successes(self) -> int:
        return sum(1 for r in self.results if 200 <= r.status < 500)

    @property
    def errors(self) -> int:
        return sum(1 for r in self.results if r.status >= 500 or r.error)

    @property
    def error_rate(self) -> float:
        return self.errors / max(self.total, 1)

    @property
    def durations(self) -> list[float]:
        return sorted([r.duration_ms for r in self.results if not r.error])

    @property
    def p50(self) -> float:
        d = self.durations
        return d[len(d) // 2] if d else 0

    @property
    def p95(self) -> float:
        d = self.durations
        idx = int(len(d) * 0.95)
        return d[min(idx, len(d) - 1)] if d else 0

    @property
    def p99(self) -> float:
        d = self.durations
        idx = int(len(d) * 0.99)
        return d[min(idx, len(d) - 1)] if d else 0

    @property
    def avg(self) -> float:
        d = self.durations
        return statistics.mean(d) if d else 0

    @property
    def rps(self) -> float:
        elapsed = self.end_time - self.start_time
        return self.total / max(elapsed, 0.001)


async def make_request(session, url: str, method: str = "GET", body: str | None = None, headers: dict | None = None) -> RequestResult:
    """Make an HTTP request using asyncio subprocess curl for true async."""
    start = time.monotonic()
    try:
        cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", method]
        if headers:
            for k, v in headers.items():
                cmd.extend(["-H", f"{k}: {v}"])
        if body:
            cmd.extend(["-d", body])
        cmd.extend(["--max-time", "10", url])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        duration_ms = (time.monotonic() - start) * 1000
        status_code = int(stdout.decode().strip()) if stdout else 0
        return RequestResult(url=url, status=status_code, duration_ms=duration_ms)
    except Exception as e:
        duration_ms = (time.monotonic() - start) * 1000
        return RequestResult(url=url, status=0, duration_ms=duration_ms, error=str(e))


async def run_scenario(base_url: str, vus: int, duration_secs: int, name: str) -> TestResults:
    """Run a stress test scenario with N virtual users for M seconds."""
    results = TestResults(name=name)
    results.start_time = time.monotonic()
    end_at = results.start_time + duration_secs

    endpoints = [
        ("GET", "/health", None, None),
        ("GET", "/api/health", None, None),
        ("GET", "/api/v1/support/faq", None, None),
        ("GET", "/api/v1/farms/", None, {"Authorization": "Bearer stress-test-token"}),
        ("POST", "/api/v1/sync/", json.dumps({"last_synced_at": None, "data": {}}),
         {"Content-Type": "application/json", "Authorization": "Bearer stress-test-token"}),
    ]

    async def virtual_user(vu_id: int):
        while time.monotonic() < end_at:
            for method, path, body, headers in endpoints:
                if time.monotonic() >= end_at:
                    break
                url = urljoin(base_url, path)
                result = await make_request(None, url, method, body, headers)
                results.results.append(result)
                await asyncio.sleep(0.1 + (vu_id % 5) * 0.1)  # stagger

    # Launch VUs
    tasks = [asyncio.create_task(virtual_user(i)) for i in range(vus)]
    await asyncio.gather(*tasks)
    results.end_time = time.monotonic()
    return results


def print_results(results: TestResults):
    elapsed = results.end_time - results.start_time
    print(f"\n{'='*60}")
    print(f"  {results.name}")
    print(f"{'='*60}")
    print(f"  Duration:    {elapsed:.1f}s")
    print(f"  Requests:    {results.total}")
    print(f"  RPS:         {results.rps:.1f} req/s")
    print(f"  Success:     {results.successes} ({(1-results.error_rate)*100:.1f}%)")
    print(f"  Errors:      {results.errors} ({results.error_rate*100:.1f}%)")
    print(f"  Latency:")
    print(f"    avg:       {results.avg:.0f}ms")
    print(f"    p50:       {results.p50:.0f}ms")
    print(f"    p95:       {results.p95:.0f}ms")
    print(f"    p99:       {results.p99:.0f}ms")
    print(f"{'='*60}")

    # Per-status breakdown
    status_counts = {}
    for r in results.results:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1
    print("  Status codes:")
    for status, count in sorted(status_counts.items()):
        print(f"    {status}: {count}")
    print()

    # Pass/Fail
    if results.p95 < 500 and results.error_rate < 0.05:
        print("  RESULT: PASS")
    elif results.p95 < 1000 and results.error_rate < 0.10:
        print("  RESULT: WARNING (degraded performance)")
    else:
        print("  RESULT: FAIL")


async def main():
    parser = argparse.ArgumentParser(description="EGGlogU Stress Test")
    parser.add_argument("--url", default="https://api.egglogu.com", help="Base URL")
    parser.add_argument("--vus", type=int, default=50, help="Virtual users")
    parser.add_argument("--duration", type=int, default=30, help="Duration in seconds")
    parser.add_argument("--scenario", choices=["smoke", "load", "stress", "full"], default="smoke")
    args = parser.parse_args()

    print(f"\nEGGlogU Stress Test")
    print(f"Target: {args.url}")
    print(f"Scenario: {args.scenario}\n")

    scenarios = {
        "smoke": [(5, 15, "Smoke Test (5 VUs, 15s)")],
        "load": [(10, 20, "Warm-up (10 VUs)"), (50, 30, "Load (50 VUs)"), (100, 30, "Peak Load (100 VUs)")],
        "stress": [(50, 15, "Warm-up"), (200, 30, "Stress (200 VUs)"), (500, 30, "Heavy Stress (500 VUs)")],
        "full": [
            (5, 10, "Smoke (5 VUs)"),
            (50, 20, "Load (50 VUs)"),
            (100, 20, "Peak (100 VUs)"),
            (200, 20, "Stress (200 VUs)"),
            (500, 20, "Heavy (500 VUs)"),
        ],
    }

    if args.scenario not in scenarios:
        # Custom single run
        results = await run_scenario(args.url, args.vus, args.duration, f"Custom ({args.vus} VUs, {args.duration}s)")
        print_results(results)
    else:
        all_results = []
        for vus, dur, name in scenarios[args.scenario]:
            print(f"  Running: {name}...")
            results = await run_scenario(args.url, vus, dur, name)
            print_results(results)
            all_results.append(results)
            await asyncio.sleep(2)  # cool down between stages

        # Save summary
        summary = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "target": args.url,
            "scenario": args.scenario,
            "stages": [
                {
                    "name": r.name,
                    "requests": r.total,
                    "rps": round(r.rps, 1),
                    "p50_ms": round(r.p50),
                    "p95_ms": round(r.p95),
                    "p99_ms": round(r.p99),
                    "error_rate": round(r.error_rate, 4),
                }
                for r in all_results
            ],
        }
        with open("stress_test_results.json", "w") as f:
            json.dump(summary, f, indent=2)
        print(f"\nResults saved to stress_test_results.json")


if __name__ == "__main__":
    asyncio.run(main())
