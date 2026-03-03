#!/usr/bin/env bash
# EGGlogU Enterprise — Failover Drill
# Kills PostgreSQL primary and measures Recovery Time Objective (RTO).
# REQUIRES: docker compose with pg-primary, pg-replica, pgbouncer services.
#
# Usage: ./failover-drill.sh [--auto-promote]
# Safety: This is a DESTRUCTIVE test — run ONLY on staging/test environments.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
API_URL="${API_URL:-http://localhost:8000}"
HEALTH_ENDPOINT="${API_URL}/api/v1/health/ready"
AUTO_PROMOTE="${1:-}"

log() { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }
fail(){ echo -e "${RED}[✗]${NC} $1"; }

echo "═══════════════════════════════════════════════════════"
echo "  EGGlogU — PostgreSQL Failover Drill"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Pre-flight checks ─────────────────────────────────────
log "Pre-flight checks..."

if ! command -v docker &> /dev/null; then
    fail "docker not found"; exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q "pg-primary"; then
    fail "pg-primary container not found. Is docker compose running?"
    exit 1
fi

# Verify primary is healthy
PRIMARY_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T pg-primary pg_isready -U egglogu 2>&1 || true)
if echo "$PRIMARY_STATUS" | grep -q "accepting connections"; then
    ok "Primary accepting connections"
else
    fail "Primary not healthy: $PRIMARY_STATUS"; exit 1
fi

# Verify replica is streaming
REPLICA_LAG=$(docker compose -f "$COMPOSE_FILE" exec -T pg-replica \
    psql -U egglogu -d egglogu -t -c \
    "SELECT CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
            ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())::int END;" 2>/dev/null || echo "-1")
REPLICA_LAG=$(echo "$REPLICA_LAG" | tr -d '[:space:]')

if [ "$REPLICA_LAG" = "-1" ]; then
    warn "Could not check replica lag (replica may not be streaming)"
else
    ok "Replica lag: ${REPLICA_LAG}s"
fi

# Verify API is responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    ok "API health endpoint responding (HTTP $HTTP_CODE)"
else
    warn "API health returned HTTP $HTTP_CODE (may not be running)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PHASE 1: Kill Primary"
echo "═══════════════════════════════════════════════════════"

# Record baseline latency
BASELINE_MS=$(curl -s -o /dev/null -w "%{time_total}" "$HEALTH_ENDPOINT" 2>/dev/null || echo "0")
BASELINE_MS=$(echo "$BASELINE_MS * 1000" | bc 2>/dev/null || echo "0")
log "Baseline health latency: ${BASELINE_MS}ms"

# Kill primary (SIGKILL — worst case scenario)
KILL_TIME=$(date +%s%N)
log "Killing pg-primary with SIGKILL..."
docker compose -f "$COMPOSE_FILE" kill -s SIGKILL pg-primary

ok "Primary killed at $(date +%H:%M:%S.%3N)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PHASE 2: Measure Downtime"
echo "═══════════════════════════════════════════════════════"

# Poll health endpoint every 500ms
DOWNTIME_START=$(date +%s%N)
POLL_COUNT=0
MAX_POLLS=240  # 120 seconds max wait

log "Polling health endpoint every 500ms (max 120s)..."

while [ $POLL_COUNT -lt $MAX_POLLS ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$HEALTH_ENDPOINT" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        RECOVERY_TIME=$(date +%s%N)
        RTO_NS=$((RECOVERY_TIME - KILL_TIME))
        RTO_MS=$((RTO_NS / 1000000))
        RTO_SEC=$(echo "scale=2; $RTO_MS / 1000" | bc)

        echo ""
        ok "API recovered after ${RTO_SEC}s (${RTO_MS}ms)"
        break
    fi

    POLL_COUNT=$((POLL_COUNT + 1))
    ELAPSED_MS=$(( ($(date +%s%N) - KILL_TIME) / 1000000 ))

    if [ $((POLL_COUNT % 10)) -eq 0 ]; then
        warn "Still down after ${ELAPSED_MS}ms (HTTP $HTTP_CODE)..."
    fi

    sleep 0.5
done

if [ $POLL_COUNT -ge $MAX_POLLS ]; then
    fail "API did not recover within 120s — FAILOVER FAILED"
    RTO_MS=999999
    RTO_SEC="TIMEOUT"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PHASE 3: Promote Replica (if --auto-promote)"
echo "═══════════════════════════════════════════════════════"

if [ "$AUTO_PROMOTE" = "--auto-promote" ]; then
    log "Promoting replica to primary..."
    docker compose -f "$COMPOSE_FILE" exec -T pg-replica \
        pg_ctl promote -D /var/lib/postgresql/data 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" exec -T pg-replica \
        psql -U egglogu -c "SELECT pg_promote();" 2>/dev/null || \
    warn "Auto-promote failed — manual intervention needed"

    sleep 2

    PROMOTE_CHECK=$(docker compose -f "$COMPOSE_FILE" exec -T pg-replica \
        psql -U egglogu -t -c "SELECT pg_is_in_recovery();" 2>/dev/null || echo "error")
    PROMOTE_CHECK=$(echo "$PROMOTE_CHECK" | tr -d '[:space:]')

    if [ "$PROMOTE_CHECK" = "f" ]; then
        ok "Replica promoted to primary successfully"
    else
        warn "Replica still in recovery mode (pg_is_in_recovery=$PROMOTE_CHECK)"
    fi
else
    log "Skipping auto-promote (use --auto-promote flag to enable)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  PHASE 4: Restart Primary & Verify"
echo "═══════════════════════════════════════════════════════"

log "Restarting pg-primary..."
docker compose -f "$COMPOSE_FILE" up -d pg-primary
sleep 5

PRIMARY_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T pg-primary pg_isready -U egglogu 2>&1 || true)
if echo "$PRIMARY_STATUS" | grep -q "accepting connections"; then
    ok "Primary restarted and accepting connections"
else
    warn "Primary restart pending: $PRIMARY_STATUS"
fi

# Final health check
sleep 2
FINAL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" 2>/dev/null || echo "000")
FINAL_MS=$(curl -s -o /dev/null -w "%{time_total}" "$HEALTH_ENDPOINT" 2>/dev/null || echo "0")
FINAL_MS=$(echo "$FINAL_MS * 1000" | bc 2>/dev/null || echo "0")

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RESULTS"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Baseline latency:    ${BASELINE_MS}ms"
echo "  Recovery Time (RTO): ${RTO_SEC}s (${RTO_MS}ms)"
echo "  Post-recovery HTTP:  ${FINAL_HTTP}"
echo "  Post-recovery latency: ${FINAL_MS}ms"
echo ""

# Verdict
if [ "$RTO_MS" -lt 5000 ] 2>/dev/null; then
    ok "VERDICT: PASS — RTO < 5s (target: <5min)"
elif [ "$RTO_MS" -lt 300000 ] 2>/dev/null; then
    warn "VERDICT: ACCEPTABLE — RTO < 5min"
else
    fail "VERDICT: FAIL — RTO exceeded 5min target"
fi

# JSON output
cat <<EOJSON

{
  "test": "failover-drill",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "baseline_ms": ${BASELINE_MS%.*},
  "rto_ms": $RTO_MS,
  "rto_seconds": "$RTO_SEC",
  "post_recovery_http": $FINAL_HTTP,
  "post_recovery_ms": ${FINAL_MS%.*},
  "auto_promote": $([ "$AUTO_PROMOTE" = "--auto-promote" ] && echo "true" || echo "false"),
  "verdict": "$([ "$RTO_MS" -lt 300000 ] 2>/dev/null && echo "PASS" || echo "FAIL")"
}
EOJSON
