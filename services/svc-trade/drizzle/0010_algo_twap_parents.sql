-- trade.algo · durable TWAP parent schedules (D-S-04 residual)
-- Reversal: 0010_algo_twap_parents.down.sql
--
-- The parent is a SCHEDULE only: no balance, fill, or P&L columns.
-- Progress for users is always a sum of child fills (presentAlgoProgress).
-- Children are ordinary orders; we store refs for resume-after-restart only.

DO $$ BEGIN
  CREATE TYPE "trade"."algo_status" AS ENUM ('active', 'paused', 'cancelled', 'completed', 'halted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "trade"."algo_kind" AS ENUM ('twap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trade"."algo_parents" (
  "id"                  text PRIMARY KEY,
  "user_id"             text NOT NULL,
  "sub_account_id"      text,
  "market_id"           uuid NOT NULL REFERENCES "trade"."markets" ("id"),
  "symbol"              text NOT NULL,
  "side"                "trade"."order_side" NOT NULL,
  "kind"                "trade"."algo_kind" NOT NULL DEFAULT 'twap',
  "total_qty"           numeric(38, 18) NOT NULL,
  "duration_ms"         integer NOT NULL,
  "slice_interval_ms"   integer NOT NULL,
  "limit_price"         numeric(38, 18),
  "status"              "trade"."algo_status" NOT NULL DEFAULT 'active',
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "started_at"          timestamptz NOT NULL,
  "paused_at"           timestamptz,
  "halt_reason"         text,
  "slices_planned"      integer NOT NULL,
  "next_slice_index"    integer NOT NULL DEFAULT 0,
  -- Schedule slice qtys as decimal strings (JSON array). Not fills.
  "plan_slices"         jsonb NOT NULL,
  -- Child refs + misses as JSON (impoverished audit for resume).
  "children"            jsonb NOT NULL DEFAULT '[]'::jsonb,
  "misses"              jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "algo_parents_qty_positive_ck" CHECK ("total_qty" > 0),
  CONSTRAINT "algo_parents_duration_positive_ck" CHECK ("duration_ms" > 0 AND "slice_interval_ms" > 0),
  CONSTRAINT "algo_parents_slices_ck" CHECK ("slices_planned" > 0 AND "next_slice_index" >= 0)
);

CREATE INDEX IF NOT EXISTS "algo_parents_user_status_idx"
  ON "trade"."algo_parents" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "algo_parents_active_idx"
  ON "trade"."algo_parents" ("status")
  WHERE "status" = 'active';
