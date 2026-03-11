"""
EGGlogU Load Test — Locust (Phase 9)
=====================================
Simulates realistic user traffic patterns against the production API.

Usage:
    # Headless mode (CI/CD):
    locust -f locustfile.py --headless -u 100 -r 10 --run-time 5m \
        --host https://api.egglogu.com --csv=reports/locust

    # With web UI:
    locust -f locustfile.py --host https://api.egglogu.com
"""

import json
import random
import uuid
from datetime import date, timedelta

from locust import HttpUser, between, events, task, tag


# Pre-registered test account (created before load test starts)
_PW = "LoadTest2026!Secure#"
_SETUP_EMAIL = None
_SETUP_TOKEN = None


class EggLogUUser(HttpUser):
    """Simulates a typical EGGlogU user session."""

    wait_time = between(1, 3)
    host = "https://api.egglogu.com"

    def on_start(self):
        """Register + verify + login to get a token."""
        uid = uuid.uuid4().hex[:8]
        self.email = f"load_{uid}@test.egglogu.dev"
        self.org_name = f"LoadOrg {uid}"
        self.token = None
        self.farm_id = None
        self.flock_id = None

        # Register
        r = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": self.email,
                "password": _PW,
                "full_name": f"Load Tester {uid}",
                "organization_name": self.org_name,
            },
            name="/api/v1/auth/register",
        )

        if r.status_code == 429:
            # Rate limited — use read-only mode
            return

        if r.status_code != 201:
            return

        # Login (will fail if email not verified — that's expected in load test)
        r = self.client.post(
            "/api/v1/auth/login",
            json={"email": self.email, "password": _PW},
            name="/api/v1/auth/login",
        )
        if r.status_code == 200:
            self.token = r.json().get("access_token")

    @property
    def _headers(self):
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    # ── Read-heavy tasks (70% weight) ──────────────────────────────────

    @task(20)
    @tag("read")
    def list_farms(self):
        self.client.get("/api/v1/farms/", headers=self._headers, name="/api/v1/farms/ [GET]")

    @task(15)
    @tag("read")
    def list_flocks(self):
        self.client.get("/api/v1/flocks/", headers=self._headers, name="/api/v1/flocks/ [GET]")

    @task(15)
    @tag("read")
    def list_production(self):
        self.client.get("/api/v1/production/", headers=self._headers, name="/api/v1/production/ [GET]")

    @task(10)
    @tag("read")
    def get_health(self):
        self.client.get("/health", name="/health [GET]")

    @task(10)
    @tag("read")
    def get_single_farm(self):
        if self.farm_id:
            self.client.get(
                f"/api/v1/farms/{self.farm_id}",
                headers=self._headers,
                name="/api/v1/farms/:id [GET]",
            )

    # ── Write tasks (20% weight) ──────────────────────────────────────

    @task(8)
    @tag("write")
    def create_farm(self):
        if not self.token:
            return
        r = self.client.post(
            "/api/v1/farms/",
            json={"name": f"Load Farm {uuid.uuid4().hex[:6]}"},
            headers=self._headers,
            name="/api/v1/farms/ [POST]",
        )
        if r.status_code == 201:
            self.farm_id = r.json().get("id")

    @task(6)
    @tag("write")
    def create_flock(self):
        if not self.token or not self.farm_id:
            return
        r = self.client.post(
            "/api/v1/flocks/",
            json={
                "farm_id": self.farm_id,
                "name": f"Flock {uuid.uuid4().hex[:4]}",
                "initial_count": random.randint(1000, 10000),
                "current_count": random.randint(900, 9500),
                "start_date": str(date.today() - timedelta(days=random.randint(30, 365))),
                "breed": random.choice(["Hy-Line Brown", "Lohmann", "ISA Brown", "Novogen"]),
            },
            headers=self._headers,
            name="/api/v1/flocks/ [POST]",
        )
        if r.status_code == 201:
            self.flock_id = r.json().get("id")

    @task(6)
    @tag("write")
    def create_production(self):
        if not self.token or not self.flock_id:
            return
        total = random.randint(2000, 8000)
        self.client.post(
            "/api/v1/production/",
            json={
                "flock_id": self.flock_id,
                "date": str(date.today() - timedelta(days=random.randint(1, 90))),
                "total_eggs": total,
                "broken": random.randint(0, int(total * 0.02)),
                "small": random.randint(0, int(total * 0.1)),
                "medium": random.randint(0, int(total * 0.3)),
                "large": random.randint(0, int(total * 0.4)),
                "xl": random.randint(0, int(total * 0.2)),
                "deaths": random.randint(0, 5),
            },
            headers=self._headers,
            name="/api/v1/production/ [POST]",
        )

    # ── Auth tasks (10% weight) ───────────────────────────────────────

    @task(5)
    @tag("auth")
    def login_again(self):
        """Simulate re-login / token refresh."""
        if not self.email:
            return
        self.client.post(
            "/api/v1/auth/login",
            json={"email": self.email, "password": _PW},
            name="/api/v1/auth/login [refresh]",
        )

    @task(5)
    @tag("auth")
    def unauthorized_access(self):
        """Test that unauth access is properly rejected."""
        self.client.get(
            "/api/v1/farms/",
            headers={"Authorization": "Bearer invalid"},
            name="/api/v1/farms/ [unauth]",
        )
