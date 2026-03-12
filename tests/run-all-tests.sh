#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# EGGlogU — Unified Test Orchestrator
# Runs ALL testing tools in sequence with reports
# Tools: MEGA_simulation + Playwright (stress+monkey+chaos) +
#        Lighthouse + Locust (if available)
# ═══════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPORT_DIR="reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_FILE="${REPORT_DIR}/test-results-${TIMESTAMP}.md"
FAILURES=0
TOTAL=0

mkdir -p "$REPORT_DIR" "$REPORT_DIR/lighthouse"

log() { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
pass() { echo -e "${GREEN}  ✅ $1${NC}"; ((TOTAL++)); }
fail() { echo -e "${RED}  ❌ $1${NC}"; ((TOTAL++)); ((FAILURES++)); }
skip() { echo -e "${YELLOW}  ⏭️  $1 (skipped)${NC}"; }

echo -e "${BOLD}"
echo "═══════════════════════════════════════════════════════════"
echo "  EGGlogU — UNIFIED TEST SUITE"
echo "  $(date)"
echo "═══════════════════════════════════════════════════════════"
echo -e "${NC}"

# Initialize results file
cat > "$RESULTS_FILE" << EOF
# EGGlogU Test Results — ${TIMESTAMP}

| Suite | Status | Duration | Details |
|-------|--------|----------|---------|
EOF

# ─────────────────────────────────────────
# Phase 1: Data Generation (MEGA Simulation)
# ─────────────────────────────────────────
log "${BOLD}Phase 1: MEGA Simulation — Data Generation${NC}"
START=$(date +%s)

if [ -f "data/MEGA_simulation.js" ]; then
  if node data/MEGA_simulation.js > "${REPORT_DIR}/mega-sim-${TIMESTAMP}.log" 2>&1; then
    END=$(date +%s)
    DURATION=$((END - START))
    pass "MEGA Simulation completed (${DURATION}s)"
    echo "| MEGA Simulation | ✅ PASS | ${DURATION}s | 1000 clients, 28 flocks, 365 days |" >> "$RESULTS_FILE"
  else
    END=$(date +%s)
    DURATION=$((END - START))
    fail "MEGA Simulation failed"
    echo "| MEGA Simulation | ❌ FAIL | ${DURATION}s | Check ${REPORT_DIR}/mega-sim-${TIMESTAMP}.log |" >> "$RESULTS_FILE"
  fi
else
  skip "MEGA Simulation (data/MEGA_simulation.js not found)"
  echo "| MEGA Simulation | ⏭️ SKIP | — | File not found |" >> "$RESULTS_FILE"
fi

# ─────────────────────────────────────────
# Phase 2: E2E Tests (Playwright)
# ─────────────────────────────────────────
log "${BOLD}Phase 2: Playwright E2E Tests${NC}"

run_playwright_suite() {
  local SUITE_NAME="$1"
  local SPEC_FILE="$2"

  if [ ! -f "$SPEC_FILE" ]; then
    skip "$SUITE_NAME ($SPEC_FILE not found)"
    echo "| $SUITE_NAME | ⏭️ SKIP | — | File not found |" >> "$RESULTS_FILE"
    return
  fi

  START=$(date +%s)
  if npx playwright test "$SPEC_FILE" --reporter=list 2>&1 | tee "${REPORT_DIR}/${SUITE_NAME}-${TIMESTAMP}.log"; then
    END=$(date +%s)
    DURATION=$((END - START))
    PASSED=$(grep -c "✓\|passed" "${REPORT_DIR}/${SUITE_NAME}-${TIMESTAMP}.log" 2>/dev/null || echo "?")
    pass "$SUITE_NAME (${DURATION}s, ${PASSED} passed)"
    echo "| $SUITE_NAME | ✅ PASS | ${DURATION}s | ${PASSED} tests passed |" >> "$RESULTS_FILE"
  else
    END=$(date +%s)
    DURATION=$((END - START))
    fail "$SUITE_NAME (${DURATION}s)"
    echo "| $SUITE_NAME | ❌ FAIL | ${DURATION}s | Check ${REPORT_DIR}/${SUITE_NAME}-${TIMESTAMP}.log |" >> "$RESULTS_FILE"
  fi
}

run_playwright_suite "stress" "tests/e2e/stress.spec.js"
run_playwright_suite "monkey" "tests/e2e/monkey.spec.js"
run_playwright_suite "chaos" "tests/e2e/chaos.spec.js"
run_playwright_suite "basic" "tests/e2e/basic.spec.js"

# ─────────────────────────────────────────
# Phase 3: Lighthouse Audit
# ─────────────────────────────────────────
log "${BOLD}Phase 3: Lighthouse Performance Audit${NC}"

if command -v lighthouse &> /dev/null || npx lighthouse --version &> /dev/null 2>&1; then
  run_playwright_suite "lighthouse" "tests/e2e/lighthouse.spec.js"
else
  skip "Lighthouse (not installed — npm install -g lighthouse)"
  echo "| Lighthouse | ⏭️ SKIP | — | Not installed |" >> "$RESULTS_FILE"
fi

# ─────────────────────────────────────────
# Phase 4: Load Testing (Locust — optional)
# ─────────────────────────────────────────
log "${BOLD}Phase 4: Load Testing (Locust)${NC}"

if command -v locust &> /dev/null; then
  if [ -f "backend/tests/load/locustfile.py" ]; then
    START=$(date +%s)
    if locust -f backend/tests/load/locustfile.py \
      --headless --users 10 --spawn-rate 2 --run-time 30s \
      --host http://localhost:8000 \
      --csv "${REPORT_DIR}/locust-${TIMESTAMP}" 2>&1 | tee "${REPORT_DIR}/locust-${TIMESTAMP}.log"; then
      END=$(date +%s)
      DURATION=$((END - START))
      pass "Locust load test (${DURATION}s)"
      echo "| Locust Load Test | ✅ PASS | ${DURATION}s | 10 users, 30s |" >> "$RESULTS_FILE"
    else
      END=$(date +%s)
      DURATION=$((END - START))
      fail "Locust load test"
      echo "| Locust Load Test | ❌ FAIL | ${DURATION}s | Check log |" >> "$RESULTS_FILE"
    fi
  else
    skip "Locust (locustfile.py not found)"
    echo "| Locust Load Test | ⏭️ SKIP | — | File not found |" >> "$RESULTS_FILE"
  fi
else
  skip "Locust (not installed — pip install locust)"
  echo "| Locust Load Test | ⏭️ SKIP | — | Not installed |" >> "$RESULTS_FILE"
fi

# ─────────────────────────────────────────
# Phase 5: Security Scan (if gitleaks available)
# ─────────────────────────────────────────
log "${BOLD}Phase 5: Security Scan${NC}"

if command -v gitleaks &> /dev/null; then
  START=$(date +%s)
  if gitleaks detect --source . --report-path "${REPORT_DIR}/gitleaks-${TIMESTAMP}.json" 2>&1; then
    END=$(date +%s)
    DURATION=$((END - START))
    pass "Gitleaks — no secrets found (${DURATION}s)"
    echo "| Gitleaks Security | ✅ PASS | ${DURATION}s | No secrets |" >> "$RESULTS_FILE"
  else
    END=$(date +%s)
    DURATION=$((END - START))
    fail "Gitleaks — secrets detected!"
    echo "| Gitleaks Security | ❌ FAIL | ${DURATION}s | SECRETS FOUND |" >> "$RESULTS_FILE"
  fi
else
  skip "Gitleaks (not installed)"
  echo "| Gitleaks Security | ⏭️ SKIP | — | Not installed |" >> "$RESULTS_FILE"
fi

# ─────────────────────────────────────────
# Summary
# ─────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════${NC}"

cat >> "$RESULTS_FILE" << EOF

## Summary
- **Total suites:** ${TOTAL}
- **Failures:** ${FAILURES}
- **Timestamp:** ${TIMESTAMP}
EOF

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}  ✅ ALL ${TOTAL} SUITES PASSED${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "  Report: ${RESULTS_FILE}"
  exit 0
else
  echo -e "${RED}  ❌ ${FAILURES}/${TOTAL} SUITES FAILED${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
  echo -e "  Report: ${RESULTS_FILE}"
  exit 1
fi
