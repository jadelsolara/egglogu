"""WebSocket endpoint for real-time dashboard updates.

Clients connect to /ws/dashboard/{farm_id}?token=<jwt> and receive
live events (production, health alerts, IoT readings, etc.) via
Redis Pub/Sub → WebSocket push.

Auth: JWT token passed as query parameter (WebSocket doesn't support custom headers).
Heartbeat: server sends ping every 30s to detect stale connections.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from src.config import settings
from src.core.events import subscribe_farm, subscribe_org

logger = logging.getLogger("egglogu.websocket")

router = APIRouter()


# ─── Connection Manager ─────────────────────────────────────────────

class ConnectionManager:
    """Track active WebSocket connections per farm/org."""

    def __init__(self):
        # farm_id → set of websockets
        self._farm_connections: dict[str, set[WebSocket]] = {}
        # org_id → set of websockets
        self._org_connections: dict[str, set[WebSocket]] = {}

    def connect_farm(self, farm_id: str, ws: WebSocket):
        self._farm_connections.setdefault(farm_id, set()).add(ws)

    def connect_org(self, org_id: str, ws: WebSocket):
        self._org_connections.setdefault(org_id, set()).add(ws)

    def disconnect_farm(self, farm_id: str, ws: WebSocket):
        conns = self._farm_connections.get(farm_id)
        if conns:
            conns.discard(ws)
            if not conns:
                del self._farm_connections[farm_id]

    def disconnect_org(self, org_id: str, ws: WebSocket):
        conns = self._org_connections.get(org_id)
        if conns:
            conns.discard(ws)
            if not conns:
                del self._org_connections[org_id]

    @property
    def total_connections(self) -> int:
        farm_count = sum(len(c) for c in self._farm_connections.values())
        org_count = sum(len(c) for c in self._org_connections.values())
        return farm_count + org_count


manager = ConnectionManager()

HEARTBEAT_INTERVAL = 30  # seconds


# ─── Auth ────────────────────────────────────────────────────────────

def _verify_ws_token(token: str) -> dict | None:
    """Verify JWT token for WebSocket auth. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None


# ─── Farm Dashboard WebSocket ────────────────────────────────────────

@router.websocket("/ws/dashboard/{farm_id}")
async def ws_farm_dashboard(websocket: WebSocket, farm_id: str, token: str = Query(...)):
    """WebSocket for live farm dashboard updates."""
    # Auth
    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    user_id = payload.get("sub")
    org_id = payload.get("org")

    await websocket.accept()
    manager.connect_farm(farm_id, websocket)
    logger.info("WS connected: user=%s farm=%s (total=%d)", user_id, farm_id, manager.total_connections)

    # Subscribe to Redis Pub/Sub for this farm
    pubsub = await subscribe_farm(farm_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "farm_id": farm_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        if pubsub:
            await _relay_events(websocket, pubsub)
        else:
            # No Redis — keep connection alive with heartbeat only
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                await websocket.send_json({"type": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})

    except WebSocketDisconnect:
        logger.info("WS disconnected: user=%s farm=%s", user_id, farm_id)
    except Exception as e:
        logger.warning("WS error for farm=%s: %s", farm_id, e)
    finally:
        manager.disconnect_farm(farm_id, websocket)
        if pubsub:
            await pubsub.unsubscribe()
            await pubsub.aclose()


# ─── Org-wide WebSocket ─────────────────────────────────────────────

@router.websocket("/ws/org/{org_id}")
async def ws_org_dashboard(websocket: WebSocket, org_id: str, token: str = Query(...)):
    """WebSocket for org-wide live updates (all farms)."""
    payload = _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    token_org = payload.get("org")
    if token_org != org_id:
        await websocket.close(code=4003, reason="Organization mismatch")
        return

    user_id = payload.get("sub")

    await websocket.accept()
    manager.connect_org(org_id, websocket)
    logger.info("WS org connected: user=%s org=%s", user_id, org_id)

    pubsub = await subscribe_org(org_id)

    try:
        await websocket.send_json({
            "type": "connected",
            "org_id": org_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        if pubsub:
            await _relay_events(websocket, pubsub)
        else:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                await websocket.send_json({"type": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})

    except WebSocketDisconnect:
        logger.info("WS org disconnected: user=%s org=%s", user_id, org_id)
    except Exception as e:
        logger.warning("WS error for org=%s: %s", org_id, e)
    finally:
        manager.disconnect_org(org_id, websocket)
        if pubsub:
            await pubsub.unsubscribe()
            await pubsub.aclose()


# ─── Event Relay ─────────────────────────────────────────────────────

async def _relay_events(websocket: WebSocket, pubsub):
    """Relay Redis Pub/Sub messages to WebSocket with heartbeat."""
    last_heartbeat = asyncio.get_event_loop().time()

    while True:
        # Check for Redis messages (non-blocking with timeout)
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)

        if message and message["type"] == "message":
            try:
                data = json.loads(message["data"])
                await websocket.send_json(data)
            except (json.JSONDecodeError, Exception) as e:
                logger.warning("Failed to relay event: %s", e)

        # Heartbeat
        now = asyncio.get_event_loop().time()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL:
            await websocket.send_json({
                "type": "heartbeat",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            last_heartbeat = now

        # Small sleep to prevent tight loop
        await asyncio.sleep(0.1)
