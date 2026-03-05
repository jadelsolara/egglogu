#!/usr/bin/env python3
"""
EGGlogU Client Simulation — Realistic user behavior simulation.

Simulates N poultry farm clients going through their daily workflow:
  1. Register + Login
  2. Create farm + flocks
  3. Daily production logging (30 days of data)
  4. Health events (vaccines, medications)
  5. Feed purchases + consumption tracking
  6. Client management + invoicing
  7. Environment readings
  8. Operations (checklists, logbook)
  9. Sync operations
  10. Analytics / reporting checks

Usage:
    python3 client_simulation.py --url https://api.egglogu.com --clients 5
    python3 client_simulation.py --url http://localhost:8000 --clients 20 --days 60

Output:
    client_simulation_results_<timestamp>.json
"""

import argparse
import asyncio
import json
import os
import random
import string
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

LOADTEST_SECRET = os.environ.get("LOADTEST_SECRET", "")


# ─── Data ──────────────────────────────────────────────────────────

BREEDS = [
    "Hy-Line W-36", "Hy-Line Brown", "Lohmann LSL-Classic",
    "Lohmann Brown-Classic", "ISA Brown", "Novogen Brown",
    "Dekalb White", "Babcock B-300",
]

VACCINE_NAMES = [
    "Newcastle Disease (B1)", "Infectious Bronchitis", "Marek's Disease",
    "Avian Influenza H5N1", "Fowl Pox", "Infectious Bursal Disease",
    "Mycoplasma Gallisepticum", "Salmonella Enteritidis",
]

FEED_TYPES = ["Layer Mash", "Layer Pellets", "Pre-Lay Crumble", "Calcium Supplement", "Grit"]

STRESS_TYPES = [
    "heat_wave", "cold_snap", "power_outage", "predator_sighting",
    "equipment_failure", "water_disruption", "noise_disturbance",
]

EXPENSE_CATEGORIES = ["feed", "medication", "labor", "utilities", "transport", "equipment", "maintenance"]


@dataclass
class SimResult:
    client_id: int
    step: str
    method: str
    path: str
    status: int
    duration_ms: float
    error: str | None = None
    data: dict = field(default_factory=dict)


@dataclass
class ClientState:
    client_id: int
    email: str
    password: str
    headers: dict | None = None
    farm_id: str | None = None
    flock_ids: list[str] = field(default_factory=list)
    client_ids: list[str] = field(default_factory=list)
    results: list[SimResult] = field(default_factory=list)

    @property
    def success_count(self):
        return sum(1 for r in self.results if 200 <= r.status < 400)

    @property
    def error_count(self):
        return sum(1 for r in self.results if r.status >= 400 or r.error)


# ─── HTTP Helper ───────────────────────────────────────────────────

async def api_call(
    base_url: str, method: str, path: str, body: dict | None = None,
    headers: dict | None = None, step: str = "",
) -> tuple[int, dict | None, float]:
    """Make API call, return (status, json_body, duration_ms)."""
    url = f"{base_url.rstrip('/')}{path}"
    start = time.monotonic()
    try:
        cmd = ["curl", "-s", "-w", "\n%{http_code}", "-X", method]
        if headers:
            for k, v in headers.items():
                cmd.extend(["-H", f"{k}: {v}"])
        if body:
            cmd.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
        cmd.extend(["--max-time", "15", url])

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        ms = (time.monotonic() - start) * 1000

        lines = stdout.decode().strip().rsplit("\n", 1)
        status = int(lines[-1]) if lines else 0
        resp_body = None
        if len(lines) > 1 and lines[0].strip():
            try:
                resp_body = json.loads(lines[0])
            except json.JSONDecodeError:
                pass
        return status, resp_body, ms
    except Exception as e:
        ms = (time.monotonic() - start) * 1000
        return 0, None, ms


# ─── Client Lifecycle Simulation ───────────────────────────────────

async def simulate_client(base_url: str, client_id: int, days: int) -> ClientState:
    """Simulate one complete client lifecycle."""
    rnd = ''.join(random.choices(string.ascii_lowercase, k=6))
    state = ClientState(
        client_id=client_id,
        email=f"sim_{rnd}_{client_id}@egglogu-test.com",
        password=f"SimPass_{rnd}_123!",
    )

    async def record(step, method, path, body=None):
        status, resp, ms = await api_call(base_url, method, path, body, state.headers, step)
        state.results.append(SimResult(
            client_id=client_id, step=step, method=method,
            path=path, status=status, duration_ms=ms,
            data=resp if resp and isinstance(resp, dict) else {},
        ))
        return status, resp

    print(f"  [Client {client_id}] Starting simulation...")

    # ── Step 1: Register + Auth ──
    reg_payload = {
        "email": state.email,
        "password": state.password,
        "full_name": f"Sim User {client_id}",
        "organization_name": f"SimFarm_{rnd}",
    }

    if LOADTEST_SECRET:
        # Fast path: loadtest endpoint (auto-verified, returns tokens)
        old_headers = state.headers
        state.headers = {"X-Loadtest-Secret": LOADTEST_SECRET, "Content-Type": "application/json"}
        status, resp = await record("register", "POST", "/api/v1/auth/loadtest-register", reg_payload)
        state.headers = old_headers
        if resp and "access_token" in resp:
            state.headers = {
                "Authorization": f"Bearer {resp['access_token']}",
                "Content-Type": "application/json",
            }
        else:
            print(f"  [Client {client_id}] Loadtest register failed ({status})")
            return state
    else:
        # Fallback: normal register + login
        status, resp = await record("register", "POST", "/api/v1/auth/register", reg_payload)
        if status not in (200, 201):
            print(f"  [Client {client_id}] Registration failed ({status})")
            return state

        status, resp = await record("login", "POST", "/api/v1/auth/login", {
            "email": state.email, "password": state.password,
        })
        if resp and "access_token" in resp:
            state.headers = {
                "Authorization": f"Bearer {resp['access_token']}",
                "Content-Type": "application/json",
            }
        else:
            print(f"  [Client {client_id}] Login failed ({status})")
            return state

    # ── Step 3: Create Farm ──
    farm_name = random.choice(["Green Valley", "Sunrise", "Golden Egg", "Hill Top", "River Side"])
    status, resp = await record("create_farm", "POST", "/api/v1/farms/", {
        "name": f"{farm_name} Farm #{client_id}",
    })
    if resp and "id" in resp:
        state.farm_id = resp["id"]

    if not state.farm_id:
        print(f"  [Client {client_id}] Farm creation failed ({status})")
        return state

    # ── Step 4: Create Flocks (2-4 per farm) ──
    n_flocks = random.randint(2, 4)
    for i in range(n_flocks):
        breed = random.choice(BREEDS)
        count = random.randint(500, 15000)
        start_date = (date.today() - timedelta(days=days + random.randint(0, 60))).isoformat()
        status, resp = await record(f"create_flock_{i}", "POST", "/api/v1/flocks/", {
            "farm_id": state.farm_id,
            "name": f"Flock {chr(65 + i)}",
            "breed": breed,
            "initial_count": count,
            "current_count": count,
            "start_date": start_date,
        })
        if resp and "id" in resp:
            state.flock_ids.append(resp["id"])
        await asyncio.sleep(0.1)

    if not state.flock_ids:
        print(f"  [Client {client_id}] No flocks created, limited simulation")

    # ── Step 5: Daily Production (N days) ──
    for day_offset in range(days):
        d = (date.today() - timedelta(days=days - day_offset)).isoformat()
        for flock_id in state.flock_ids:
            total_eggs = random.randint(200, 800)
            broken = random.randint(0, int(total_eggs * 0.03))
            deaths = random.randint(0, 3)
            small = int(total_eggs * 0.1)
            medium = int(total_eggs * 0.4)
            large = int(total_eggs * 0.35)
            xl = total_eggs - small - medium - large - broken
            await record(f"production_day_{day_offset}", "POST", "/api/v1/production/", {
                "flock_id": flock_id,
                "date": d,
                "total_eggs": total_eggs,
                "broken": broken,
                "small": small,
                "medium": medium,
                "large": large,
                "xl": max(0, xl),
                "deaths": deaths,
                "notes": "" if random.random() > 0.2 else f"Day {day_offset} observation",
            })
        # Don't hammer the API — real users space out their entries
        await asyncio.sleep(0.05)

    # ── Step 6: Health Events ──
    for flock_id in state.flock_ids:
        # Vaccines (2-4 per flock)
        for _ in range(random.randint(2, 4)):
            vax_date = (date.today() - timedelta(days=random.randint(1, days))).isoformat()
            await record("create_vaccine", "POST", "/api/v1/vaccines", {
                "flock_id": flock_id,
                "name": random.choice(VACCINE_NAMES),
                "date": vax_date,
                "method": "spray",
                "notes": "Routine vaccination",
            })
            await asyncio.sleep(0.05)

        # Medications (0-2 per flock)
        for _ in range(random.randint(0, 2)):
            await record("create_medication", "POST", "/api/v1/medications", {
                "flock_id": flock_id,
                "name": random.choice(["Amoxicillin", "Enrofloxacin", "Tylosin", "Ivermectin"]),
                "start_date": (date.today() - timedelta(days=random.randint(1, 30))).isoformat(),
                "dosage": f"{random.randint(1, 10)}ml/L",
                "notes": "Treatment protocol",
            })
            await asyncio.sleep(0.05)

    # ── Step 7: Feed Tracking ──
    for week in range(days // 7):
        purchase_date = (date.today() - timedelta(days=days - week * 7)).isoformat()
        feed_type = random.choice(FEED_TYPES)
        qty_kg = random.randint(500, 5000)
        cost = round(qty_kg * random.uniform(0.3, 0.8), 2)
        price_per_kg = round(random.uniform(0.3, 0.8), 2)
        await record("feed_purchase", "POST", "/api/v1/feed/purchases", {
            "date": purchase_date,
            "type": feed_type,
            "kg": qty_kg,
            "price_per_kg": price_per_kg,
            "total_cost": round(qty_kg * price_per_kg, 2),
            "brand": random.choice(["Nutreco", "Cargill", "ADM", "Local Mill"]),
        })
        await asyncio.sleep(0.05)

    # ── Step 8: Clients + Finance ──
    for i in range(random.randint(2, 6)):
        await record(f"create_client_{i}", "POST", "/api/v1/clients/", {
            "name": f"Client {chr(65 + i)} of Farm {client_id}",
            "phone": f"+1555{random.randint(1000000, 9999999)}",
            "email": f"client{i}_{rnd}@example.com",
        })
        await asyncio.sleep(0.05)

    # Income entries
    for _ in range(random.randint(3, 10)):
        await record("create_income", "POST", "/api/v1/income", {
            "date": (date.today() - timedelta(days=random.randint(1, days))).isoformat(),
            "amount": round(random.uniform(100, 5000), 2),
            "category": "egg_sales",
            "description": "Egg sales",
        })
        await asyncio.sleep(0.05)

    # Expense entries
    for _ in range(random.randint(3, 8)):
        await record("create_expense", "POST", "/api/v1/expenses", {
            "date": (date.today() - timedelta(days=random.randint(1, days))).isoformat(),
            "amount": round(random.uniform(50, 3000), 2),
            "category": random.choice(EXPENSE_CATEGORIES),
            "description": "Operational expense",
        })
        await asyncio.sleep(0.05)

    # ── Step 9: Environment Readings ──
    for day_offset in range(0, days, 3):  # every 3 days
        d = (date.today() - timedelta(days=days - day_offset)).isoformat()
        await record("env_reading", "POST", "/api/v1/environment", {
            "date": d,
            "time": "08:00",
            "temp_c": round(random.uniform(18, 32), 1),
            "humidity_pct": round(random.uniform(40, 80), 1),
            "light_lux": round(random.uniform(300, 800), 0),
        })
        await asyncio.sleep(0.03)

    # ── Step 10: Sync ──
    await record("sync_push", "POST", "/api/v1/sync/", {
        "last_synced_at": None, "data": {},
    })

    # ── Step 11: Read-back verification (GET all major endpoints) ──
    read_endpoints = [
        "/api/v1/farms/", "/api/v1/flocks/", "/api/v1/production/",
        "/api/v1/vaccines", "/api/v1/feed/purchases", "/api/v1/clients/",
        "/api/v1/income", "/api/v1/expenses",
        "/api/v1/analytics/economics", "/api/v1/billing/status",
    ]
    for ep in read_endpoints:
        await record("read_verify", "GET", ep)
        await asyncio.sleep(0.05)

    print(f"  [Client {client_id}] Done: {state.success_count} ok / {state.error_count} errors / {len(state.results)} total")
    return state


# ─── Main ──────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="EGGlogU Client Simulation")
    parser.add_argument("--url", default="https://api.egglogu.com")
    parser.add_argument("--clients", type=int, default=5, help="Number of simulated clients")
    parser.add_argument("--days", type=int, default=30, help="Days of data per client")
    parser.add_argument("--parallel", type=int, default=5, help="Max concurrent clients")
    args = parser.parse_args()

    print(f"\nEGGlogU Client Simulation")
    print(f"Target: {args.url}")
    print(f"Clients: {args.clients} | Days: {args.days} | Parallel: {args.parallel}\n")

    start = time.monotonic()
    all_states = []

    # Run clients in batches
    sem = asyncio.Semaphore(args.parallel)

    async def limited_client(cid):
        async with sem:
            return await simulate_client(args.url, cid, args.days)

    tasks = [asyncio.create_task(limited_client(i)) for i in range(args.clients)]
    all_states = await asyncio.gather(*tasks)

    elapsed = time.monotonic() - start

    # ── Report ──
    total_requests = sum(len(s.results) for s in all_states)
    total_success = sum(s.success_count for s in all_states)
    total_errors = sum(s.error_count for s in all_states)

    print(f"\n{'=' * 70}")
    print(f"  CLIENT SIMULATION REPORT")
    print(f"{'=' * 70}")
    print(f"  Clients Simulated: {args.clients}")
    print(f"  Days Per Client:   {args.days}")
    print(f"  Total Duration:    {elapsed:.1f}s")
    print(f"  Total Requests:    {total_requests}")
    print(f"  Throughput:        {total_requests / max(elapsed, 1):.1f} req/s")
    print(f"  Success:           {total_success} ({total_success / max(total_requests, 1) * 100:.1f}%)")
    print(f"  Errors:            {total_errors} ({total_errors / max(total_requests, 1) * 100:.1f}%)")

    # Per-step breakdown
    step_stats = {}
    for s in all_states:
        for r in s.results:
            step_stats.setdefault(r.step, {"count": 0, "errors": 0, "durations": []})
            step_stats[r.step]["count"] += 1
            if r.status >= 400 or r.error:
                step_stats[r.step]["errors"] += 1
            step_stats[r.step]["durations"].append(r.duration_ms)

    print(f"\n  Per-Step Breakdown:")
    print(f"  {'Step':<25} {'Count':>6} {'Errors':>7} {'Avg ms':>8} {'p95 ms':>8}")
    print(f"  {'-' * 54}")
    for step in sorted(step_stats.keys()):
        s = step_stats[step]
        d = sorted(s["durations"])
        avg = sum(d) / len(d)
        p95 = d[int(len(d) * 0.95)] if d else 0
        print(f"  {step:<25} {s['count']:>6} {s['errors']:>7} {avg:>7.0f} {p95:>7.0f}")

    # Per-client summary
    print(f"\n  Per-Client Summary:")
    for s in all_states:
        farm_ok = "farm" if s.farm_id else "NO FARM"
        flocks = len(s.flock_ids)
        print(f"    Client {s.client_id}: {s.success_count} ok / {s.error_count} err | {farm_ok} | {flocks} flocks")

    print(f"\n{'=' * 70}\n")

    # Save report
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "target": args.url,
        "config": {"clients": args.clients, "days": args.days, "parallel": args.parallel},
        "duration_s": round(elapsed, 1),
        "total_requests": total_requests,
        "success": total_success,
        "errors": total_errors,
        "throughput_rps": round(total_requests / max(elapsed, 1), 1),
        "clients": [
            {
                "id": s.client_id,
                "success": s.success_count,
                "errors": s.error_count,
                "farm_id": s.farm_id,
                "flocks": len(s.flock_ids),
                "total_requests": len(s.results),
            }
            for s in all_states
        ],
    }
    outfile = f"simulation_results_{time.strftime('%Y%m%d_%H%M%S')}.json"
    with open(outfile, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Report saved to {outfile}")


if __name__ == "__main__":
    asyncio.run(main())
