-- intafaced:destructive — reversal of 0001_multi_asset_instruments.sql
--
-- Drops the instrument columns and removes the seeded markets. Destructive on
-- two counts, and the second is the one that matters:
--
--   1. `asset_class`, `quote_unit`, `pip_size`, `schedule` and `planes` are how
--      a non-crypto listing describes itself. Dropping them leaves any surviving
--      forex or commodity row indistinguishable from a 24/7 crypto market — the
--      exact state this migration existed to end.
--   2. Deleting a market row would orphan every order and fill that references
--      it, and `trade.orders.market_id` is the only link between a live ledger
--      hold (`order.hold:<orderId>`) and the market it was placed on.
--
-- So the market delete refuses if anything has ever traded on these symbols,
-- rather than cascading. A seed may be un-seeded; a book may not.
DO $$
DECLARE
  traded text;
BEGIN
  SELECT string_agg(DISTINCT m."symbol", ', ') INTO traded
    FROM "trade"."markets" m
   WHERE EXISTS (SELECT 1 FROM "trade"."orders" o WHERE o."market_id" = m."id");

  IF traded IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot reverse 0001: orders exist on %. Those orders are funded by live ledger holds that only '
      'this schema can attribute. Close and settle them before rolling back.',
      traded;
  END IF;
END $$;

DELETE FROM "trade"."markets"
 WHERE "symbol" IN (
   'BTC/USDT', 'ETH/USDT', 'BTC/USDC', 'ETH/USDC', 'IFC/USDT',
   'XAU/USD', 'XAG/USD', 'WTI/USD', 'BRENT/USD', 'NATGAS/USD',
   'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CHF', 'USD/CAD'
 );

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_hours_match_class_ck";
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_pip_matches_class_ck";
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_unit_size_positive_ck";
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_planes_valid_ck";
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_display_name_present_ck";

DROP INDEX IF EXISTS "trade"."markets_asset_class_idx";

ALTER TABLE "trade"."markets"
  DROP COLUMN IF EXISTS "asset_class",
  DROP COLUMN IF EXISTS "quote_unit",
  DROP COLUMN IF EXISTS "unit_size",
  DROP COLUMN IF EXISTS "pip_size",
  DROP COLUMN IF EXISTS "schedule",
  DROP COLUMN IF EXISTS "planes",
  DROP COLUMN IF EXISTS "display_name";

DROP TYPE IF EXISTS "trade"."trading_schedule";
DROP TYPE IF EXISTS "trade"."instrument_unit";
DROP TYPE IF EXISTS "trade"."asset_class";
