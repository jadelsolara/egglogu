#!/bin/sh
# ============================================================
# EGGlogU Off-site Backup — Cloudflare R2
# ============================================================
# Runs pg_dump → gzip → uploads to R2 via S3-compatible API
# Requires: AWS CLI (bundled in container), R2 credentials in env
#
# Environment variables:
#   R2_ENDPOINT_URL  — Cloudflare R2 S3-compatible endpoint
#   R2_ACCESS_KEY_ID — R2 API token access key
#   R2_SECRET_ACCESS_KEY — R2 API token secret key
#   R2_BUCKET        — R2 bucket name (default: egglogu-backups)
#   R2_RETENTION_DAYS — Days to keep remote backups (default: 30)
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE — PostgreSQL credentials
# ============================================================

set -e

BUCKET="${R2_BUCKET:-egglogu-backups}"
RETENTION_DAYS="${R2_RETENTION_DAYS:-30}"
LOCAL_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="egglogu_${TIMESTAMP}.sql.gz"
FILEPATH="${LOCAL_DIR}/${FILENAME}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# --- Step 1: Local pg_dump ---
log "Starting PostgreSQL dump..."
pg_dump -Fc | gzip > "${FILEPATH}"
SIZE=$(du -h "${FILEPATH}" | cut -f1)
log "Local backup OK: ${FILEPATH} (${SIZE})"

# --- Step 2: Upload to R2 (if credentials configured) ---
if [ -n "${R2_ENDPOINT_URL}" ] && [ -n "${R2_ACCESS_KEY_ID}" ] && [ -n "${R2_SECRET_ACCESS_KEY}" ]; then
    log "Uploading to Cloudflare R2: s3://${BUCKET}/${FILENAME}"

    export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
    export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
    export AWS_DEFAULT_REGION="auto"

    # Upload
    aws s3 cp "${FILEPATH}" "s3://${BUCKET}/${FILENAME}" \
        --endpoint-url "${R2_ENDPOINT_URL}" \
        --no-progress

    if [ $? -eq 0 ]; then
        log "R2 upload OK: s3://${BUCKET}/${FILENAME}"
    else
        log "ERROR: R2 upload FAILED"
    fi

    # --- Step 3: Clean remote backups older than retention period ---
    CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d 2>/dev/null)
    if [ -n "${CUTOFF_DATE}" ]; then
        log "Cleaning R2 backups older than ${RETENTION_DAYS} days (before ${CUTOFF_DATE})..."
        aws s3 ls "s3://${BUCKET}/" --endpoint-url "${R2_ENDPOINT_URL}" | \
            awk '{print $4}' | grep "^egglogu_" | while read -r remote_file; do
                file_date=$(echo "${remote_file}" | sed 's/egglogu_\([0-9]\{8\}\).*/\1/')
                if [ "${file_date}" \< "${CUTOFF_DATE}" ]; then
                    log "Deleting old remote backup: ${remote_file}"
                    aws s3 rm "s3://${BUCKET}/${remote_file}" --endpoint-url "${R2_ENDPOINT_URL}"
                fi
            done
        log "R2 cleanup done"
    fi
else
    log "WARNING: R2 credentials not configured — backup is LOCAL ONLY"
    log "Set R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to enable off-site backup"
fi

# --- Step 4: Clean local backups older than 7 days ---
find "${LOCAL_DIR}" -name "egglogu_*.sql.gz" -mtime +7 -delete
log "Local cleanup done (7-day retention)"

log "Backup cycle complete"
