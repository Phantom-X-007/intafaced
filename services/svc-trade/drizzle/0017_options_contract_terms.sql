-- trade.options · European contract terms + fail-closed half-list CHECK.
-- Reversal: 0017_options_contract_terms.down.sql
--
-- Honest thin slice (trade.options residual, D7 still owner):
--
--   · Full-collateral European options need NO IV model — payoff is mechanical
--     once a settlement price is known. Agents must not invent an IV surface.
--   · Settlement fixing law (which source, window, expiry clock, funded payor)
--     is D7 and is NOT decided here. The `settlement_fixing` column holds an
--     opaque operator string once `TRADE_OPTIONS_SETTLEMENT_FIXING` is set; the
--     listing path refuses kind=options while that env is empty.
--   · A half-listed option (kind=options with missing strike/type/expiry/fixing,
--     or option terms on a non-options row) must be impossible at the database
--     boundary as well as in the service — same reason `markets_hours_match_class_ck`
--     exists: a hand-inserted bad row must not sit dormant until first use.
--
-- Every statement is idempotent / re-runnable.

DO $$ BEGIN
  CREATE TYPE "trade"."option_type" AS ENUM ('call', 'put');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- v1 title is European only. Adding American is a product decision + migration.
DO $$ BEGIN
  CREATE TYPE "trade"."option_style" AS ENUM ('european');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "trade"."markets"
  ADD COLUMN IF NOT EXISTS "option_type" "trade"."option_type",
  ADD COLUMN IF NOT EXISTS "option_style" "trade"."option_style",
  ADD COLUMN IF NOT EXISTS "option_strike" numeric(38, 18),
  ADD COLUMN IF NOT EXISTS "option_expiry_at" timestamptz,
  -- Opaque stamp from TRADE_OPTIONS_SETTLEMENT_FIXING when listed. Not a price.
  ADD COLUMN IF NOT EXISTS "settlement_fixing" text;

COMMENT ON COLUMN "trade"."markets"."option_type" IS
  'call|put when kind=options; NULL otherwise. Part of European contract identity.';
COMMENT ON COLUMN "trade"."markets"."option_style" IS
  'european only in v1 when kind=options; NULL otherwise.';
COMMENT ON COLUMN "trade"."markets"."option_strike" IS
  'Strike in quote units (scaled decimal) when kind=options; NULL otherwise.';
COMMENT ON COLUMN "trade"."markets"."option_expiry_at" IS
  'European expiry instant (UTC) when kind=options; NULL otherwise.';
COMMENT ON COLUMN "trade"."markets"."settlement_fixing" IS
  'Opaque D7 fixing config id stamped at list time. Empty env refuses listing; this column is never a fabricated oracle price.';

-- Half-list impossible: options rows are all-or-nothing; non-options carry no terms.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_options_terms_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_options_terms_ck"
  CHECK (
    (
      "kind" <> 'options'
      AND "option_type" IS NULL
      AND "option_style" IS NULL
      AND "option_strike" IS NULL
      AND "option_expiry_at" IS NULL
      AND "settlement_fixing" IS NULL
    )
    OR
    (
      "kind" = 'options'
      AND "option_type" IS NOT NULL
      AND "option_style" = 'european'
      AND "option_strike" IS NOT NULL
      AND "option_strike" > 0
      AND "option_expiry_at" IS NOT NULL
      AND "settlement_fixing" IS NOT NULL
      AND length(btrim("settlement_fixing")) > 0
    )
  );

COMMENT ON CONSTRAINT "markets_options_terms_ck" ON "trade"."markets" IS
  'kind=options requires complete European terms + non-empty settlement_fixing; non-options must carry none. Blocks half-listed options.';
