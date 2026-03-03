-- Create replication user for streaming replication.
-- Executed once on primary via docker-entrypoint-initdb.d.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'replicator') THEN
        CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'repl_secret_change_me';
    END IF;
END
$$;

-- Allow replication slots to be used
SELECT pg_create_physical_replication_slot('replica_slot_1', true)
WHERE NOT EXISTS (
    SELECT FROM pg_replication_slots WHERE slot_name = 'replica_slot_1'
);
