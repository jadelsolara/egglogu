#!/usr/bin/env bash
# EGGlogU Enterprise — Stress Test Runner
# Runs all stress tests in sequence with reports.
#
# Usage:
#   ./run-all.sh                     # All tests (quick mode)
#   ./run-all.sh --full              # Full suite (includes soak 4h)
#   ./run-all.sh --test load         # Single test
#   ./run-all.sh --test spike,ws     # Multiple tests
#
# Prerequisites:
#   - k6: https://k6.io/docs/get-started/installation/
#   - docker compose running (for pgbench and failover)
#   - python3 + httpx (for multi-tenant test)
#   - pgbench (postgresql-client)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
BASE_URL="${BASE_URL:-http://localhost:8000}"
PG_CONN="${PG_CONN:-postgresql://egglogu:egglogu@localhost:5432/egglogu}"
FULL_MODE=false
SELECTED_TESTS=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --full) FULL_MODE=true; shift ;;
        --test) SELECTED_TESTS="$2"; shift 2 ;;
        --base-url) BASE_URL="$2"; shift 2 ;;
        --pg) PG_CONN="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

mkdir -p "$RESULTS_DIR"

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; }

run_test() {
    local name="$1"
    local cmd="$2"
    local required="$3"

    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  TEST: $name${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Check if tool exists
    if ! command -v "$required" &> /dev/null; then
        warn "SKIPPED — '$required' not installed"
        echo "SKIPPED" >> "$RESULTS_DIR/summary_${TIMESTAMP}.txt"
        return 0
    fi

    local start_time=$(date +%s)

    if eval "$cmd" > "$RESULTS_DIR/${name}_${TIMESTAMP}.log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        ok "$name completed in ${duration}s"
        echo "PASS ($duration s)" >> "$RESULTS_DIR/summary_${TIMESTAMP}.txt"
    else
        local exit_code=$?
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        fail "$name failed (exit $exit_code) after ${duration}s"
        echo "FAIL (exit $exit_code, $duration s)" >> "$RESULTS_DIR/summary_${TIMESTAMP}.txt"
    fi

    # Show last 5 lines of output
    echo "  Last output:"
    tail -5 "$RESULTS_DIR/${name}_${TIMESTAMP}.log" 2>/dev/null | sed 's/^/    /'
}

should_run() {
    local test_name="$1"
    if [ -z "$SELECTED_TESTS" ]; then
        return 0  # Run all
    fi
    echo "$SELECTED_TESTS" | tr ',' '\n' | grep -qi "$test_name"
}

# ── Header ────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  EGGlogU Enterprise — Stress Test Suite"
echo "═══════════════════════════════════════════════════════"
echo "  Target:     $BASE_URL"
echo "  Mode:       $([ "$FULL_MODE" = true ] && echo 'FULL (includes soak)' || echo 'QUICK')"
echo "  Results:    $RESULTS_DIR"
echo "  Timestamp:  $TIMESTAMP"
echo "═══════════════════════════════════════════════════════"

echo "# Stress Test Results — $TIMESTAMP" > "$RESULTS_DIR/summary_${TIMESTAMP}.txt"
echo "Target: $BASE_URL" >> "$RESULTS_DIR/summary_${TIMESTAMP}.txt"
echo "" >> "$RESULTS_DIR/summary_${TIMESTAMP}.txt"

# ── Pre-flight ────────────────────────────────────────────
log "Pre-flight checks..."

# Check API is reachable
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    ok "API reachable (HTTP $HTTP_CODE)"
else
    warn "API returned HTTP $HTTP_CODE — tests may fail"
fi

# ── Test 1: k6 Load Test ─────────────────────────────────
if should_run "load"; then
    run_test "k6-load" \
        "k6 run --env BASE_URL=$BASE_URL --out json=$RESULTS_DIR/k6-load_${TIMESTAMP}.json $SCRIPT_DIR/k6-load-test.js" \
        "k6"
fi

# ── Test 2: k6 Spike Test ────────────────────────────────
if should_run "spike"; then
    run_test "k6-spike" \
        "k6 run --env BASE_URL=$BASE_URL --out json=$RESULTS_DIR/k6-spike_${TIMESTAMP}.json $SCRIPT_DIR/k6-spike-test.js" \
        "k6"
fi

# ── Test 3: k6 WebSocket Test ────────────────────────────
if should_run "ws" || should_run "websocket"; then
    run_test "k6-websocket" \
        "k6 run --env BASE_URL=$BASE_URL --out json=$RESULTS_DIR/k6-ws_${TIMESTAMP}.json $SCRIPT_DIR/k6-websocket-test.js" \
        "k6"
fi

# ── Test 4: pgbench RLS Performance ──────────────────────
if should_run "pgbench" || should_run "rls"; then
    # Generate a test org_id
    TEST_ORG_ID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "00000000-0000-0000-0000-000000000001")

    run_test "pgbench-rls" \
        "pgbench -c 10 -j 2 -T 60 -f $SCRIPT_DIR/pgbench-rls.sql -D org_id=$TEST_ORG_ID '$PG_CONN'" \
        "pgbench"
fi

# ── Test 5: Multi-Tenant Isolation ───────────────────────
if should_run "tenant" || should_run "multi"; then
    run_test "multi-tenant" \
        "python3 $SCRIPT_DIR/multi-tenant-test.py --base-url $BASE_URL --orgs 50 --workers 10" \
        "python3"
fi

# ── Test 6: Failover Drill (requires docker) ─────────────
if should_run "failover"; then
    run_test "failover-drill" \
        "bash $SCRIPT_DIR/failover-drill.sh" \
        "docker"
fi

# ── Test 7: Soak Test (FULL mode only) ───────────────────
if [ "$FULL_MODE" = true ] && should_run "soak"; then
    run_test "k6-soak" \
        "k6 run --env BASE_URL=$BASE_URL --env DURATION=4h --out json=$RESULTS_DIR/k6-soak_${TIMESTAMP}.json $SCRIPT_DIR/k6-soak-test.js" \
        "k6"
elif should_run "soak" && [ "$FULL_MODE" = false ]; then
    echo ""
    warn "Soak test skipped (use --full for 4h soak test)"
fi

# ── Summary ───────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "═══════════════════════════════════════════════════════"
echo ""
cat "$RESULTS_DIR/summary_${TIMESTAMP}.txt"
echo ""
echo "  Full logs: $RESULTS_DIR/"
echo "═══════════════════════════════════════════════════════"
