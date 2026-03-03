#!/bin/bash
# Initialize PostgreSQL replica from primary via pg_basebackup.
# Runs ONLY if the replica data directory is empty (first boot).

set -e

PGDATA="/var/lib/postgresql/data"

if [ -f "$PGDATA/PG_VERSION" ]; then
    echo "Replica data directory already initialized — skipping pg_basebackup."
    exit 0
fi

echo "Replica data directory empty — initializing from primary..."

until pg_isready -h postgres -U replicator -q; do
    echo "Waiting for primary to be ready..."
    sleep 2
done

pg_basebackup \
    -h postgres \
    -U replicator \
    -D "$PGDATA" \
    -Fp -Xs -P -R \
    --checkpoint=fast

echo "pg_basebackup complete. Replica will start in standby mode."
