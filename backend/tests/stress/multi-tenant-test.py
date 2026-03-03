#!/usr/bin/env python3
"""
EGGlogU Enterprise — Multi-Tenant Isolation Stress Test
Tests that 100 concurrent organizations cannot access each other's data
through RLS (Row-Level Security) under load.

Usage:
    python multi-tenant-test.py --orgs 100 --workers 20
    python multi-tenant-test.py --base-url http://localhost:8000 --orgs 50
"""

import asyncio
import argparse
import json
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime

try:
    import httpx
except ImportError:
    print("ERROR: httpx required. Install: pip install httpx")
    sys.exit(1)


@dataclass
class TenantResult:
    org_id: str
    org_name: str
    registered: bool = False
    login_ok: bool = False
    data_created: bool = False
    isolation_ok: bool = False
    cross_tenant_blocked: bool = False
    errors: list = field(default_factory=list)
    latency_ms: float = 0.0


@dataclass
class TestSummary:
    total_orgs: int = 0
    registered: int = 0
    login_success: int = 0
    data_created: int = 0
    isolation_pass: int = 0
    cross_tenant_pass: int = 0
    total_errors: int = 0
    duration_sec: float = 0.0
    verdict: str = "PENDING"


class MultiTenantStressTest:
    def __init__(self, base_url: str, num_orgs: int, max_workers: int):
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api/v1"
        self.num_orgs = num_orgs
        self.max_workers = max_workers
        self.results: list[TenantResult] = []
        self.semaphore = asyncio.Semaphore(max_workers)

    async def register_org(self, client: httpx.AsyncClient, idx: int) -> TenantResult:
        """Register a new organization and return credentials."""
        org_name = f"StressOrg_{idx:04d}_{uuid.uuid4().hex[:8]}"
        email = f"admin_{idx}@stress.egglogu.test"
        result = TenantResult(org_id="", org_name=org_name)

        try:
            # Register
            reg_res = await client.post(f"{self.api}/auth/register", json={
                "email": email,
                "full_name": f"Admin Org {idx}",
                "organization_name": org_name,
                "farm_name": f"Farm {org_name}",
            })

            if reg_res.status_code in (200, 201):
                body = reg_res.json()
                result.org_id = body.get("organization_id", body.get("org_id", ""))
                result.registered = True
            elif reg_res.status_code == 409:
                # Already exists, try login
                result.registered = True
            else:
                result.errors.append(f"register: HTTP {reg_res.status_code}")
                return result

            # Login
            login_res = await client.post(f"{self.api}/auth/login", json={
                "email": email,
            })

            if login_res.status_code == 200:
                body = login_res.json()
                result.login_ok = True
                result._token = body.get("access_token", "")
                if not result.org_id:
                    result.org_id = body.get("organization_id", str(idx))
            else:
                result.errors.append(f"login: HTTP {login_res.status_code}")

        except Exception as e:
            result.errors.append(f"register/login: {str(e)[:100]}")

        return result

    async def create_tenant_data(self, client: httpx.AsyncClient, result: TenantResult) -> None:
        """Create identifiable data for this tenant."""
        if not hasattr(result, "_token") or not result._token:
            return

        headers = {"Authorization": f"Bearer {result._token}"}
        marker = f"MARKER_{result.org_name}_{uuid.uuid4().hex[:8]}"

        try:
            # Create a flock with unique marker
            flock_res = await client.post(f"{self.api}/flocks", json={
                "name": marker,
                "breed": "Stress Test Breed",
                "initial_count": 1000,
                "birth_date": "2025-01-01",
            }, headers=headers)

            if flock_res.status_code in (200, 201):
                result.data_created = True
                result._marker = marker
                result._flock_id = flock_res.json().get("id", "")
            else:
                result.errors.append(f"create_flock: HTTP {flock_res.status_code}")

            # Create production record
            if result._flock_id:
                await client.post(f"{self.api}/production", json={
                    "flock_id": result._flock_id,
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "eggs_collected": 500 + idx if hasattr(result, "_idx") else 500,
                    "broken_eggs": 2,
                    "deaths": 0,
                    "notes": marker,
                }, headers=headers)

        except Exception as e:
            result.errors.append(f"create_data: {str(e)[:100]}")

    async def verify_isolation(self, client: httpx.AsyncClient, result: TenantResult,
                                all_results: list[TenantResult]) -> None:
        """Verify this tenant can only see its own data."""
        if not hasattr(result, "_token") or not result._token:
            return

        headers = {"Authorization": f"Bearer {result._token}"}

        try:
            # List all flocks visible to this tenant
            flocks_res = await client.get(f"{self.api}/flocks", headers=headers)

            if flocks_res.status_code != 200:
                result.errors.append(f"list_flocks: HTTP {flocks_res.status_code}")
                return

            flocks = flocks_res.json()
            if isinstance(flocks, dict):
                flocks = flocks.get("items", flocks.get("data", []))

            # Check that we only see our own data
            flock_names = [f.get("name", "") for f in flocks]

            # Our marker should be visible
            own_marker = getattr(result, "_marker", None)
            if own_marker and own_marker in flock_names:
                result.isolation_ok = True

            # Other tenants' markers should NOT be visible
            other_markers = [
                getattr(r, "_marker", None) for r in all_results
                if r.org_id != result.org_id and hasattr(r, "_marker")
            ]

            leaked = [m for m in other_markers if m and m in flock_names]
            if not leaked:
                result.cross_tenant_blocked = True
            else:
                result.errors.append(f"DATA LEAK! Visible foreign markers: {leaked[:3]}")
                result.cross_tenant_blocked = False

        except Exception as e:
            result.errors.append(f"verify_isolation: {str(e)[:100]}")

    async def test_tenant(self, client: httpx.AsyncClient, idx: int,
                          all_results: list[TenantResult]) -> TenantResult:
        """Full lifecycle test for one tenant."""
        async with self.semaphore:
            start = time.monotonic()

            result = await self.register_org(client, idx)
            result._idx = idx

            if result.login_ok:
                await self.create_tenant_data(client, result)

            result.latency_ms = (time.monotonic() - start) * 1000
            return result

    async def run(self) -> TestSummary:
        """Execute the full multi-tenant stress test."""
        print("=" * 60)
        print("  EGGlogU — Multi-Tenant Isolation Stress Test")
        print("=" * 60)
        print(f"  Organizations: {self.num_orgs}")
        print(f"  Max workers:   {self.max_workers}")
        print(f"  Target:        {self.base_url}")
        print("=" * 60)
        print()

        summary = TestSummary(total_orgs=self.num_orgs)
        start_time = time.monotonic()

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Phase 1: Register + Login + Create Data
            print("[Phase 1] Registering organizations and creating data...")
            tasks = [
                self.test_tenant(client, i, self.results)
                for i in range(self.num_orgs)
            ]
            self.results = await asyncio.gather(*tasks, return_exceptions=True)

            # Filter out exceptions
            valid_results = []
            for r in self.results:
                if isinstance(r, Exception):
                    summary.total_errors += 1
                    print(f"  [!] Task exception: {r}")
                else:
                    valid_results.append(r)
            self.results = valid_results

            summary.registered = sum(1 for r in self.results if r.registered)
            summary.login_success = sum(1 for r in self.results if r.login_ok)
            summary.data_created = sum(1 for r in self.results if r.data_created)

            print(f"  Registered: {summary.registered}/{self.num_orgs}")
            print(f"  Logged in:  {summary.login_success}/{self.num_orgs}")
            print(f"  Data created: {summary.data_created}/{self.num_orgs}")
            print()

            # Phase 2: Verify Isolation
            print("[Phase 2] Verifying tenant isolation (RLS enforcement)...")
            isolation_tasks = [
                self.verify_isolation(client, r, self.results)
                for r in self.results if r.login_ok
            ]
            await asyncio.gather(*isolation_tasks, return_exceptions=True)

            summary.isolation_pass = sum(1 for r in self.results if r.isolation_ok)
            summary.cross_tenant_pass = sum(1 for r in self.results if r.cross_tenant_blocked)

            print(f"  Own data visible:      {summary.isolation_pass}/{summary.data_created}")
            print(f"  Cross-tenant blocked:  {summary.cross_tenant_pass}/{summary.data_created}")

        summary.duration_sec = round(time.monotonic() - start_time, 2)
        summary.total_errors = sum(len(r.errors) for r in self.results)

        # Verdict
        if summary.data_created > 0 and summary.cross_tenant_pass == summary.data_created:
            summary.verdict = "PASS — Full tenant isolation verified"
        elif summary.cross_tenant_pass < summary.data_created:
            leaked = summary.data_created - summary.cross_tenant_pass
            summary.verdict = f"FAIL — {leaked} tenant(s) had data leaks!"
        elif summary.data_created == 0:
            summary.verdict = "SKIP — No data created (registration/auth issues)"
        else:
            summary.verdict = "WARN — Partial results"

        self._print_report(summary)
        return summary

    def _print_report(self, summary: TestSummary):
        print()
        print("=" * 60)
        print("  RESULTS")
        print("=" * 60)
        print(f"  Total orgs:           {summary.total_orgs}")
        print(f"  Registered:           {summary.registered}")
        print(f"  Login success:        {summary.login_success}")
        print(f"  Data created:         {summary.data_created}")
        print(f"  Isolation verified:   {summary.isolation_pass}")
        print(f"  Cross-tenant blocked: {summary.cross_tenant_pass}")
        print(f"  Total errors:         {summary.total_errors}")
        print(f"  Duration:             {summary.duration_sec}s")
        print()
        print(f"  VERDICT: {summary.verdict}")
        print("=" * 60)

        # Errors detail
        errors = [(r.org_name, e) for r in self.results for e in r.errors]
        if errors:
            print()
            print("  ERRORS:")
            for org, err in errors[:20]:
                print(f"    [{org}] {err}")
            if len(errors) > 20:
                print(f"    ... and {len(errors) - 20} more")

        # JSON output
        report = {
            "test": "multi-tenant-isolation",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "total_orgs": summary.total_orgs,
            "registered": summary.registered,
            "login_success": summary.login_success,
            "data_created": summary.data_created,
            "isolation_verified": summary.isolation_pass,
            "cross_tenant_blocked": summary.cross_tenant_pass,
            "total_errors": summary.total_errors,
            "duration_sec": summary.duration_sec,
            "verdict": summary.verdict,
        }
        print()
        print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description="EGGlogU Multi-Tenant Isolation Stress Test")
    parser.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--orgs", type=int, default=100, help="Number of organizations to test")
    parser.add_argument("--workers", type=int, default=20, help="Max concurrent workers")
    args = parser.parse_args()

    test = MultiTenantStressTest(args.base_url, args.orgs, args.workers)
    summary = asyncio.run(test.run())

    sys.exit(0 if "PASS" in summary.verdict else 1)


if __name__ == "__main__":
    main()
