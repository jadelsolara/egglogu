"""Test script to verify pure ASGI middleware fix.
Runs inside Docker container — tests inventory/sync endpoints.
"""
import json
import os
import secrets
import urllib.error
import urllib.request

BASE = "http://localhost:8000"


def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


# 1. Health check
code, data = api("GET", "/health")
print(f"Health: {code}")

# 2. Register fresh user
email = f"mwtest_{secrets.token_hex(4)}@example.com"
pw = os.environ.get("TEST_PASS", "Xk9mW2vB7qL4zR!")
code, data = api("POST", "/api/v1/auth/register", body={
    "email": email,
    "full_name": "MW Test",
    "organization_name": "MW Test Org",
    "password": pw,
})
print(f"Register: {code}")

if code != 201:
    print(f"  Error: {data}")
    exit(1)

# 3. Auto-verify user in DB so we can login
import asyncio
from sqlalchemy import text
from src.database import async_session

async def verify_user():
    async with async_session() as session:
        await session.execute(text(
            f"UPDATE users SET is_active = true, email_verified = true, verification_token = NULL WHERE email = '{email}'"
        ))
        await session.commit()
        print("  User verified in DB")

asyncio.run(verify_user())

# 4. Login
code, data = api("POST", "/api/v1/auth/login", body={"email": email, "password": pw})
print(f"Login: {code}")
if code != 200:
    print(f"  Error: {data}")
    exit(1)

token = data["access_token"]

# 5. Test endpoints that were 500-ing (inventory + sync)
endpoints = [
    ("/api/v1/inventory/locations", "Inventory"),
    ("/api/v1/sync/", "Sync"),
    ("/api/v1/farms", "Farms"),
    ("/api/v1/flocks", "Flocks"),
    ("/api/v1/auth/me", "Auth/me"),
    ("/api/v1/production", "Production"),
    ("/api/v1/billing/status", "Billing"),
]

all_ok = True
for path, name in endpoints:
    code, resp = api("GET", path, token=token)
    status = "OK" if code < 500 else "FAIL"
    if code >= 500:
        all_ok = False
    print(f"{name}: {code} {status}")

if all_ok:
    print("\nALL ENDPOINTS OK — middleware fix verified")
else:
    print("\nSOME ENDPOINTS FAILED")
