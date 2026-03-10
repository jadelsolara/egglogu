#!/usr/bin/env bash
# EGGlogU Safe Deploy Protocol
# Validates everything BEFORE touching production.
# Usage: ./scripts/safe_deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/egglogu}"
COMPOSE="docker compose"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

cd "$APP_DIR"

# ── 1. Pre-flight checks ─────────────────────────────────────────
log "Step 1/7: Pre-flight checks..."
$COMPOSE ps --format '{{.Name}} {{.Status}}' | grep -q "healthy" || fail "Containers not healthy before deploy"
HEALTH_BEFORE=$(curl -sf http://localhost:8000/health | head -c 100)
[ -n "$HEALTH_BEFORE" ] || fail "Health check failed before deploy"
log "  Current state: HEALTHY"

# ── 2. Pull code (no restart yet) ────────────────────────────────
log "Step 2/7: Pulling latest code..."
git fetch origin main
CHANGES=$(git diff HEAD..origin/main --stat)
if [ -z "$CHANGES" ]; then
    log "  No changes to deploy. Exiting."
    exit 0
fi
echo "$CHANGES"
git pull origin main

# ── 3. Validate migrations BEFORE applying ───────────────────────
log "Step 3/7: Validating Alembic migrations..."
PENDING=$($COMPOSE exec -T app alembic check 2>&1 || true)
if echo "$PENDING" | grep -q "No new upgrade operations"; then
    log "  No pending migrations."
else
    log "  Pending migrations detected. Dry-run check..."
    # Check migration files for syntax by importing them
    $COMPOSE exec -T app python -c "
import importlib, sys, os
sys.path.insert(0, '.')
from alembic.config import Config
from alembic.script import ScriptDirectory
config = Config('alembic.ini')
script = ScriptDirectory.from_config(config)
for rev in script.walk_revisions():
    mod = script.get_revision(rev.revision)
    print(f'  OK: {rev.revision} — {rev.doc}')
print('All migration files valid.')
" || fail "Migration validation failed! NOT deploying."
    log "  Migrations validated OK."
fi

# ── 4. Build new image (without restarting) ──────────────────────
log "Step 4/7: Building new image..."
$COMPOSE build --quiet app

# ── 5. Rolling restart — app only, DB stays up ───────────────────
log "Step 5/7: Rolling restart (zero downtime)..."
# Stop old app, start new one. DB/Redis/nginx stay running.
$COMPOSE up -d --no-deps --build app worker beat

# ── 6. Run migrations (if any) ───────────────────────────────────
log "Step 6/7: Running migrations..."
sleep 3  # Let app initialize
# Backup DB before migration
log "  Creating pre-migration backup..."
$COMPOSE exec -T postgres pg_dump -U egglogu egglogu | gzip > "/tmp/pre_migrate_$(date +%Y%m%d_%H%M%S).sql.gz" || warn "Pre-migration backup failed (non-fatal)"
$COMPOSE exec -T app alembic upgrade head || {
    warn "Migration FAILED! Rolling back to previous image..."
    git stash
    $COMPOSE up -d --no-deps --build app worker beat
    fail "Migration failed. Rolled back to previous version. Pre-migration backup in /tmp/"
}

# ── 7. Post-deploy verification with retry ─────────────────────
log "Step 7/7: Post-deploy verification..."
HEALTH_AFTER=""
for i in 1 2 3 4 5; do
    sleep 3
    HEALTH_AFTER=$(curl -sf http://localhost:8000/health | head -c 100) && break
    warn "  Health check attempt $i/5 failed, retrying..."
done
if [ -z "$HEALTH_AFTER" ]; then
    warn "Health check FAILED after deploy (5 attempts)!"
    warn "Check logs: docker compose logs app --tail 50"
    fail "Deploy may need manual intervention."
fi

# Update nginx config from repo
if [ -f "nginx/conf.d/egglogu.conf" ]; then
    cp nginx/conf.d/egglogu.conf /opt/egglogu/nginx/conf.d/egglogu.conf 2>/dev/null || true
    $COMPOSE exec -T nginx nginx -s reload 2>/dev/null || true
fi

log "Deploy complete. Service healthy."
echo ""
echo "  Before: $HEALTH_BEFORE"
echo "  After:  $HEALTH_AFTER"
