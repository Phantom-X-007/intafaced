#!/bin/bash
# Dedicated database for migration-applying test suites.
# Never point those suites at the shared `intafaced` DB — schema mutations leak across worktrees.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
SELECT 'CREATE DATABASE intafaced_test OWNER intafaced'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'intafaced_test')\gexec
EOSQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname intafaced_test <<EOSQL
DO $$
DECLARE
  svc text;
  services text[] := ARRAY['identity','ledger','token','matching','trade','pay','p2p','blueprint','bank','agents','indexer','protocol'];
BEGIN
  FOREACH svc IN ARRAY services LOOP
    EXECUTE format('CREATE ROLE IF NOT EXISTS %I LOGIN PASSWORD %L', 'svc_' || svc, 'svc_' || svc);
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', svc, 'svc_' || svc);
    EXECUTE format('GRANT ALL ON SCHEMA %I TO %I', svc, 'svc_' || svc);
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', 'test_' || svc, 'svc_' || svc);
  END LOOP;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'intafaced_ops') THEN
    CREATE ROLE intafaced_ops LOGIN PASSWORD 'intafaced_ops';
  END IF;
  GRANT CREATE ON DATABASE intafaced_test TO intafaced_ops;
END
$$;
EOSQL
