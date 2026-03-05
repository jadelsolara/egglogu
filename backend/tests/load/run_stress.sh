#!/bin/bash
# EGGlogU Stress Test Runner
# Usage: ./run_stress.sh [scenario] [target]
#
# Scenarios: smoke | load | stress | spike | soak | full
# Target: defaults to https://api.egglogu.com

set -euo pipefail

# Use venv python if available
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="${SCRIPT_DIR}/../../.venv/bin/python3"
if [ -x "$VENV_PYTHON" ]; then
    PYTHON="$VENV_PYTHON"
else
    PYTHON="python3"
fi

SCENARIO="${1:-smoke}"
TARGET="${2:-https://api.egglogu.com}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="results_${TIMESTAMP}"

mkdir -p "$RESULTS_DIR"

echo "========================================"
echo "  EGGlogU Stress Test Suite"
echo "========================================"
echo "  Target:   $TARGET"
echo "  Scenario: $SCENARIO"
echo "  Output:   $RESULTS_DIR/"
echo "========================================"
echo ""

# ── Phase 1: Locust (industry standard) ──
echo "Phase 1: Locust Load Test"
echo "─────────────────────────"

case $SCENARIO in
    smoke)
        USERS=10; RATE=5; TIME="30s"
        ;;
    load)
        USERS=50; RATE=10; TIME="2m"
        ;;
    stress)
        USERS=200; RATE=20; TIME="3m"
        ;;
    spike)
        USERS=500; RATE=100; TIME="2m"
        ;;
    soak)
        USERS=30; RATE=5; TIME="10m"
        ;;
    full)
        # Run each phase sequentially
        for phase in smoke load stress spike; do
            echo "  Running $phase phase..."
            $PYTHON -m locust -f locustfile.py \
                --host "$TARGET" \
                --headless \
                -u $(case $phase in smoke) echo 10;; load) echo 50;; stress) echo 200;; spike) echo 500;; esac) \
                -r $(case $phase in smoke) echo 5;; load) echo 10;; stress) echo 20;; spike) echo 100;; esac) \
                --run-time $(case $phase in smoke) echo 30s;; load) echo 1m;; stress) echo 2m;; spike) echo 1m;; esac) \
                --csv="$RESULTS_DIR/locust_${phase}" \
                --html="$RESULTS_DIR/locust_${phase}.html" \
                --only-summary 2>&1 | tee "$RESULTS_DIR/locust_${phase}.log"
            echo ""
            sleep 5
        done
        echo "Phase 1 complete."
        echo ""
        echo "Phase 2: Client Simulation"
        echo "──────────────────────────"
        cd "$(dirname "$0")"
        $PYTHON client_simulation.py --url "$TARGET" --clients 10 --days 30 --parallel 5 2>&1 | tee "$RESULTS_DIR/simulation.log"
        mv simulation_results_*.json "$RESULTS_DIR/" 2>/dev/null || true
        echo ""
        echo "Phase 3: Custom Stress (all endpoints)"
        echo "───────────────────────────────────────"
        $PYTHON stress_test_total.py --url "$TARGET" --scenario load 2>&1 | tee "$RESULTS_DIR/stress_total.log"
        mv stress_results_*.json "$RESULTS_DIR/" 2>/dev/null || true
        echo ""
        echo "========================================"
        echo "  ALL PHASES COMPLETE"
        echo "  Results in: $RESULTS_DIR/"
        echo "========================================"
        exit 0
        ;;
    *)
        echo "Unknown scenario: $SCENARIO"
        echo "Options: smoke | load | stress | spike | soak | full"
        exit 1
        ;;
esac

# Single scenario run
cd "$(dirname "$0")"
$PYTHON -m locust -f locustfile.py \
    --host "$TARGET" \
    --headless \
    -u "$USERS" \
    -r "$RATE" \
    --run-time "$TIME" \
    --csv="$RESULTS_DIR/locust_${SCENARIO}" \
    --html="$RESULTS_DIR/locust_${SCENARIO}.html" \
    2>&1 | tee "$RESULTS_DIR/locust_${SCENARIO}.log"

echo ""
echo "Results saved to $RESULTS_DIR/"
echo "  - CSV: $RESULTS_DIR/locust_${SCENARIO}_stats.csv"
echo "  - HTML: $RESULTS_DIR/locust_${SCENARIO}.html"
