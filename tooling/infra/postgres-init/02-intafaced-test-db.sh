#!/bin/bash
# Dedicated database for migration-applying test suites.
# Never point those suites at the shared `intafaced` DB — schema mutations leak across worktrees.
#
# THIS SCRIPT USED TO SILENTLY DO ALMOST NOTHING, and two separate bugs did it:
#
#  1. The heredoc delimiter was UNQUOTED (`<<EOSQL`), so bash expanded the SQL
#     before psql ever saw it. `DO $$` became `DO <shell pid>` — the dollar-dollar
#     that opens a plpgsql body is also bash's PID variable. The block was a
#     syntax error every single time.
#  2. The loop used `CREATE ROLE IF NOT EXISTS`, which Postgres does not have. So
#     even reaching the block, it aborted on the first service.
#
# Net effect: `intafaced_test` was created and left EMPTY of service schemas. A
# suite pointed at it could not apply its migration, so suites stayed pointed at
# the shared `intafaced` database — which is precisely the cross-worktree leak
# this file exists to prevent, and it is how a branch broke `main`'s tests from
# another checkout.
#
# Both fixed below. The delimiter is quoted ('EOSQL') so the SQL is passed
# through verbatim; nothing in it needs shell expansion.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
SELECT 'CREATE DATABASE intafaced_test OWNER intafaced'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'intafaced_test')\gexec
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname intafaced_test <<'EOSQL'
-- gen_random_uuid() is a column default in several services' migrations, so the
-- test database needs it too or every INSERT fails on a schema that applied fine.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

DO $$
DECLARE
  svc text;
  services text[] := ARRAY['identity','ledger','token','matching','trade','pay','p2p','blueprint','bank','agents','indexer','protocol'];
BEGIN
  FOREACH svc IN ARRAY services LOOP
    -- Guard on pg_roles: there is no CREATE ROLE IF NOT EXISTS.
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'svc_' || svc) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', 'svc_' || svc, 'svc_' || svc);
    END IF;
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', svc, 'svc_' || svc);
    EXECUTE format('GRANT ALL ON SCHEMA %I TO %I', svc, 'svc_' || svc);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', 'svc_' || svc);
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', 'test_' || svc, 'svc_' || svc);
  END LOOP;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'intafaced_ops') THEN
    CREATE ROLE intafaced_ops LOGIN PASSWORD 'intafaced_ops';
  END IF;
  GRANT CREATE ON DATABASE intafaced_test TO intafaced_ops;
END
$$;
EOSQL
