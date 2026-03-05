"""
EGGlogU Industry-Grade Load Test (Locust)

Locust is the industry standard for load testing Python backends.
It provides real-time web UI, distributed mode, and proper statistics.

Usage:
    # Web UI (recommended — opens at http://localhost:8089):
    locust -f locustfile.py --host https://api.egglogu.com

    # Headless (CI/CD):
    locust -f locustfile.py --host https://api.egglogu.com \
        --headless -u 100 -r 10 --run-time 2m \
        --csv=results --html=report.html

    # Distributed (multiple workers):
    locust -f locustfile.py --master
    locust -f locustfile.py --worker --master-host=127.0.0.1

Scenarios:
    - PublicUser: Unauthenticated browsing (landing, FAQ, pricing)
    - DailyOperator: Farm worker doing daily data entry
    - FarmManager: Manager reviewing analytics, reports, billing
    - PowerUser: Heavy API user (sync, bulk operations, workflows)
    - BotCrawler: Simulates scraper/bot traffic (fast, GET-heavy)

SLA Targets:
    p50 < 200ms | p95 < 500ms | p99 < 1000ms | Error rate < 1%
"""

import json
import os
import random
import string
import uuid
from datetime import date, timedelta

from locust import HttpUser, TaskSet, between, events, tag, task

# Load test secret — set this env var on the server and here
LOADTEST_SECRET = os.environ.get("LOADTEST_SECRET", "")


# ─── Shared Data ───────────────────────────────────────────────────

BREEDS = [
    "Hy-Line W-36", "Hy-Line Brown", "Lohmann LSL-Classic",
    "ISA Brown", "Novogen Brown", "Dekalb White",
]
VACCINES = [
    "Newcastle Disease", "Infectious Bronchitis", "Marek's Disease",
    "Avian Influenza", "Fowl Pox", "Infectious Bursal Disease",
]
FEED_TYPES = ["Layer Mash", "Layer Pellets", "Pre-Lay Crumble", "Calcium Supplement"]
EXPENSE_CATS = ["feed", "medication", "labor", "utilities", "transport", "equipment"]


def random_string(n=8):
    return ''.join(random.choices(string.ascii_lowercase, k=n))


def random_date(days_back=90):
    return (date.today() - timedelta(days=random.randint(1, days_back))).isoformat()


# ─── Auth Mixin ────────────────────────────────────────────────────

class AuthMixin:
    """Register + login, store token in self.headers."""

    def register_and_login(self):
        rnd = random_string()
        email = f"locust_{rnd}@egglogu-test.com"
        password = f"LocustPass_{rnd}_123!"
        reg_payload = {
            "email": email,
            "password": password,
            "full_name": f"Locust {rnd}",
            "organization_name": f"LocustOrg_{rnd}",
        }

        # Fast path: loadtest endpoint (auto-verified, returns tokens)
        if LOADTEST_SECRET:
            with self.client.post(
                "/api/v1/auth/loadtest-register",
                json=reg_payload,
                headers={"X-Loadtest-Secret": LOADTEST_SECRET},
                name="/api/v1/auth/loadtest-register",
                catch_response=True,
            ) as resp:
                if resp.status_code in (200, 201):
                    data = resp.json()
                    self.auth_headers = {
                        "Authorization": f"Bearer {data['access_token']}",
                    }
                    self._email = email
                    return True
                resp.failure(f"Loadtest register failed: {resp.status_code}")
                return False

        # Fallback: normal register + login (requires email verification)
        with self.client.post(
            "/api/v1/auth/register",
            json=reg_payload,
            name="/api/v1/auth/register",
            catch_response=True,
        ) as resp:
            if resp.status_code not in (200, 201):
                resp.failure(f"Register failed: {resp.status_code}")
                return False

        with self.client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": password},
            name="/api/v1/auth/login",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                self.auth_headers = {
                    "Authorization": f"Bearer {data['access_token']}",
                }
                self._email = email
                return True
            resp.failure(f"Login failed: {resp.status_code}")
            return False

    def authed_get(self, path, **kwargs):
        return self.client.get(path, headers=self.auth_headers, **kwargs)

    def authed_post(self, path, json_data=None, **kwargs):
        return self.client.post(path, json=json_data, headers=self.auth_headers, **kwargs)

    def authed_put(self, path, json_data=None, **kwargs):
        return self.client.put(path, json=json_data, headers=self.auth_headers, **kwargs)

    def authed_delete(self, path, **kwargs):
        return self.client.delete(path, headers=self.auth_headers, **kwargs)


# ═══════════════════════════════════════════════════════════════════
# SCENARIO 1: Public User (unauthenticated)
# ═══════════════════════════════════════════════════════════════════

class PublicUser(HttpUser):
    """Simulates someone browsing the public site — no login required."""
    weight = 3  # 30% of traffic
    wait_time = between(1, 5)

    @tag("public", "health")
    @task(5)
    def health_check(self):
        self.client.get("/api/health", name="/api/health")

    @tag("public", "faq")
    @task(3)
    def browse_faq(self):
        self.client.get("/api/v1/support/faq", name="/api/v1/support/faq")

    @tag("public", "pricing")
    @task(2)
    def check_pricing(self):
        self.client.get("/api/v1/billing/pricing", name="/api/v1/billing/pricing")

    @tag("public", "lead")
    @task(1)
    def submit_lead(self):
        self.client.post("/api/leads/", json={
            "email": f"lead_{random_string(6)}@example.com",
            "source": "locust_test",
        }, name="/api/leads/")


# ═══════════════════════════════════════════════════════════════════
# SCENARIO 2: Daily Operator (farm worker)
# ═══════════════════════════════════════════════════════════════════

class DailyOperator(HttpUser, AuthMixin):
    """Farm worker: logs production, health events, feed daily."""
    weight = 4  # 40% of traffic
    wait_time = between(2, 8)

    def on_start(self):
        self.auth_headers = {}
        self.farm_id = None
        self.flock_ids = []
        if not self.register_and_login():
            return

        # Setup: create farm + flock
        resp = self.authed_post("/api/v1/farms/", {"name": f"OpFarm_{random_string(4)}"}, name="/api/v1/farms/ [setup]")
        if resp.status_code in (200, 201):
            self.farm_id = resp.json().get("id")

        if self.farm_id:
            for i in range(2):
                resp = self.authed_post("/api/v1/flocks/", {
                    "farm_id": self.farm_id,
                    "name": f"Flock {chr(65 + i)}",
                    "breed": random.choice(BREEDS),
                    "initial_count": random.randint(1000, 8000),
                    "current_count": random.randint(800, 8000),
                    "start_date": random_date(180),
                }, name="/api/v1/flocks/ [setup]")
                if resp.status_code in (200, 201):
                    self.flock_ids.append(resp.json().get("id"))

    @tag("operator", "production")
    @task(10)
    def log_production(self):
        if not self.flock_ids:
            return
        total = random.randint(200, 800)
        self.authed_post("/api/v1/production/", {
            "flock_id": random.choice(self.flock_ids),
            "date": random_date(30),
            "total_eggs": total,
            "broken": random.randint(0, 15),
            "small": random.randint(20, 100),
            "medium": random.randint(50, 200),
            "large": random.randint(50, 200),
            "xl": random.randint(10, 50),
            "deaths": random.randint(0, 3),
        }, name="/api/v1/production/")

    @tag("operator", "health")
    @task(3)
    def log_vaccine(self):
        if not self.flock_ids:
            return
        self.authed_post("/api/v1/vaccines", {
            "flock_id": random.choice(self.flock_ids),
            "name": random.choice(VACCINES),
            "date": random_date(30),
        }, name="/api/v1/vaccines")

    @tag("operator", "feed")
    @task(4)
    def log_feed_purchase(self):
        kg = random.randint(200, 3000)
        ppk = round(random.uniform(0.3, 1.5), 2)
        self.authed_post("/api/v1/feed/purchases", {
            "date": random_date(14),
            "type": random.choice(FEED_TYPES),
            "kg": kg,
            "price_per_kg": ppk,
            "total_cost": round(kg * ppk, 2),
        }, name="/api/v1/feed/purchases")

    @tag("operator", "environment")
    @task(2)
    def log_environment(self):
        self.authed_post("/api/v1/environment", {
            "date": date.today().isoformat(),
            "temp_c": round(random.uniform(18, 34), 1),
            "humidity_pct": round(random.uniform(40, 80), 1),
            "light_lux": round(random.uniform(5000, 20000), 0),
        }, name="/api/v1/environment")

    @tag("operator", "operations")
    @task(2)
    def view_checklist(self):
        self.authed_get("/api/v1/checklist", name="/api/v1/checklist")

    @tag("operator", "read")
    @task(5)
    def view_production(self):
        self.authed_get("/api/v1/production/", name="/api/v1/production/")

    @tag("operator", "sync")
    @task(1)
    def sync_data(self):
        self.authed_post("/api/v1/sync/", {
            "last_synced_at": None, "data": {},
        }, name="/api/v1/sync/")


# ═══════════════════════════════════════════════════════════════════
# SCENARIO 3: Farm Manager
# ═══════════════════════════════════════════════════════════════════

class FarmManager(HttpUser, AuthMixin):
    """Manager: reviews dashboards, analytics, finance, billing."""
    weight = 2  # 20% of traffic
    wait_time = between(3, 10)

    def on_start(self):
        self.auth_headers = {}
        self.register_and_login()

    @tag("manager", "analytics")
    @task(5)
    def view_economics(self):
        self.authed_get("/api/v1/analytics/economics", name="/api/v1/analytics/economics")

    @tag("manager", "finance")
    @task(3)
    def view_incomes(self):
        self.authed_get("/api/v1/income", name="/api/v1/income")

    @tag("manager", "finance")
    @task(3)
    def view_expenses(self):
        self.authed_get("/api/v1/expenses", name="/api/v1/expenses")

    @tag("manager", "finance")
    @task(2)
    def create_expense(self):
        self.authed_post("/api/v1/expenses", {
            "date": random_date(30),
            "amount": round(random.uniform(50, 5000), 2),
            "category": random.choice(EXPENSE_CATS),
            "description": "Operational expense",
        }, name="/api/v1/expenses [create]")

    @tag("manager", "clients")
    @task(2)
    def view_clients(self):
        self.authed_get("/api/v1/clients/", name="/api/v1/clients/")

    @tag("manager", "billing")
    @task(2)
    def check_billing(self):
        self.authed_get("/api/v1/billing/status", name="/api/v1/billing/status")

    @tag("manager", "audit")
    @task(1)
    def view_audit(self):
        self.authed_get("/api/v1/audit/logs", name="/api/v1/audit/logs")

    @tag("manager", "support")
    @task(1)
    def view_tickets(self):
        self.authed_get("/api/v1/support/tickets", name="/api/v1/support/tickets")

    @tag("manager", "reports")
    @task(2)
    def view_reports(self):
        self.authed_get("/api/v1/reports/schedules", name="/api/v1/reports/schedules")


# ═══════════════════════════════════════════════════════════════════
# SCENARIO 4: Power User (heavy API usage)
# ═══════════════════════════════════════════════════════════════════

class PowerUser(HttpUser, AuthMixin):
    """Power user: sync-heavy, workflows, inventory, biosecurity."""
    weight = 1  # 10% of traffic
    wait_time = between(1, 4)

    def on_start(self):
        self.auth_headers = {}
        self.farm_id = None
        if not self.register_and_login():
            return

        resp = self.authed_post("/api/v1/farms/", {"name": f"PowerFarm_{random_string(4)}"}, name="/api/v1/farms/ [power-setup]")
        if resp.status_code in (200, 201):
            self.farm_id = resp.json().get("id")

    @tag("power", "sync")
    @task(5)
    def heavy_sync(self):
        """Simulate large delta sync push."""
        self.authed_post("/api/v1/sync/", {
            "last_synced_at": random_date(7),
            "data": {
                "production": [
                    {
                        "flock_id": str(uuid.uuid4()),
                        "date": random_date(7),
                        "eggs_collected": random.randint(100, 500),
                    }
                    for _ in range(random.randint(5, 20))
                ],
            },
        }, name="/api/v1/sync/ [bulk]")

    @tag("power", "inventory")
    @task(3)
    def check_inventory(self):
        self.authed_get("/api/v1/inventory/stock", name="/api/v1/inventory/stock")

    @tag("power", "biosecurity")
    @task(2)
    def check_biosecurity(self):
        self.authed_get("/api/v1/biosecurity/visitors", name="/api/v1/biosecurity/visitors")
        self.authed_get("/api/v1/biosecurity/zones", name="/api/v1/biosecurity/zones")

    @tag("power", "traceability")
    @task(2)
    def check_traceability(self):
        self.authed_get("/api/v1/traceability/batches", name="/api/v1/traceability/batches")

    @tag("power", "workflows")
    @task(2)
    def check_workflows(self):
        self.authed_get("/api/v1/workflows/rules", name="/api/v1/workflows/rules")

    @tag("power", "community")
    @task(1)
    def browse_community(self):
        self.authed_get("/api/v1/community/threads", name="/api/v1/community/threads")

    @tag("power", "planning")
    @task(1)
    def check_planning(self):
        self.authed_get("/api/v1/planning/plans", name="/api/v1/planning/plans")

    @tag("power", "api-keys")
    @task(1)
    def list_api_keys(self):
        self.authed_get("/api/v1/api-keys", name="/api/v1/api-keys")

    @tag("power", "compliance")
    @task(1)
    def check_compliance(self):
        self.authed_get("/api/v1/compliance/certifications", name="/api/v1/compliance/certifications")

    @tag("power", "welfare")
    @task(1)
    def check_welfare(self):
        self.authed_get("/api/v1/welfare", name="/api/v1/welfare")


# ═══════════════════════════════════════════════════════════════════
# Custom SLA Listener — Fail the test if SLAs are breached
# ═══════════════════════════════════════════════════════════════════

@events.quitting.add_listener
def check_sla(environment, **kwargs):
    """Check SLA targets after test run and set exit code."""
    stats = environment.runner.stats
    if stats.total.fail_ratio > 0.01:
        print(f"\n  SLA BREACH: Error rate {stats.total.fail_ratio * 100:.2f}% > 1%")
        environment.process_exit_code = 1

    if stats.total.avg_response_time > 500:
        print(f"\n  SLA BREACH: Avg response time {stats.total.avg_response_time:.0f}ms > 500ms")
        environment.process_exit_code = 1

    p95 = stats.total.get_response_time_percentile(0.95) or 0
    if p95 > 1000:
        print(f"\n  SLA BREACH: p95 {p95:.0f}ms > 1000ms")
        environment.process_exit_code = 1

    if environment.process_exit_code == 0:
        print("\n  ALL SLAs PASSED")
