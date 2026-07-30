-- svc-trade · re-apply display_name backfill for databases that already applied
-- the pre-#167 form of 0001_multi_asset_instruments.sql
-- Reversal: 0002_display_name_backfill.down.sql
--
-- WHY THIS FILE EXISTS (L10 / mega-audit M1)
-- ------------------------------------------
-- Migration 0001 was shipped, applied on long-lived DBs, then edited in place
-- by #167 to insert:
--
--   UPDATE trade.markets SET display_name = symbol WHERE length(display_name) = 0;
--
-- before the NOT-empty CHECK. The trade migration runner tracks names only
-- (trade.__migrations) — it does not checksum content and never re-executes an
-- already-applied file. So any environment that ran the original 0001 still
-- has empty display_name rows and will hit the CHECK on the next constraint
-- re-add, or worse, never got the backfill at all if the failed migration
-- left the constraint off.
--
-- Fix discipline: never edit an applied up-file again. Ship a new numbered
-- migration that is idempotent for both:
--   · DBs that already ran post-#167 0001 (UPDATE touches 0 rows)
--   · DBs stuck on pre-#167 0001 (backfill + re-assert CHECK)
--
-- Empty databases that never applied 0001 will run 0001 (now correct) then
-- this no-op 0002.

-- Idempotent backfill: symbol is the same fallback listMarket uses when no
-- display name is supplied.
UPDATE "trade"."markets"
SET "display_name" = "symbol"
WHERE length("display_name") = 0;

-- Re-assert the presence CHECK (DROP IF EXISTS keeps this re-runnable if a
-- failed deploy left the constraint half-applied).
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_display_name_present_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_display_name_present_ck"
  CHECK (length("display_name") > 0);
