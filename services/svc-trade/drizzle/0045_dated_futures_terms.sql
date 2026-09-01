-- trade.futures · dated vs perpetual contract terms + fail-closed half-list CHECK.
-- Reversal: 0045_dated_futures_terms.down.sql
--
-- Honest thin slice (M10 / PTX-M10-R03):
--
--   · Isolated perps already list as kind=futures with no expiry. That remains
--     the perpetual product. Dated futures are a different product: they need
--     an expiry instant and an owner settlement/fixing stamp.
--   · A dated listing without expiry must not sit in trade.markets and trade
--     as a perp. A perp listing must not carry dated terms.
--   · Settlement fixing law (source, window, disruption fallback, delivery)
--     is owner/SOCKET (PX-S07-O03) and is NOT decided here. The column holds
--     an opaque operator string from TRADE_FUTURES_SETTLEMENT_FIXING; empty
--     env refuses dated listing. The column is never a fabricated settlement
--     price — last trade / mark must not be substituted.
--
-- Every statement is idempotent / re-runnable.

DO $$ BEGIN
  CREATE TYPE "trade"."futures_contract_style" AS ENUM ('perpetual', 'dated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "trade"."markets"
  ADD COLUMN IF NOT EXISTS "futures_contract_style" "trade"."futures_contract_style",
  ADD COLUMN IF NOT EXISTS "futures_expiry_at" timestamptz,
  -- Opaque stamp from TRADE_FUTURES_SETTLEMENT_FIXING when listed dated. Not a price.
  ADD COLUMN IF NOT EXISTS "futures_settlement_fixing" text;

COMMENT ON COLUMN "trade"."markets"."futures_contract_style" IS
  'perpetual|dated when kind=futures; NULL otherwise. Never inferred from symbol text.';
COMMENT ON COLUMN "trade"."markets"."futures_expiry_at" IS
  'Last-trade / expiry instant (UTC) when style=dated; NULL on perpetuals and non-futures.';
COMMENT ON COLUMN "trade"."markets"."futures_settlement_fixing" IS
  'Opaque owner fixing config id stamped at dated list time. Empty env refuses dated listing; this column is never a fabricated settlement price.';

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_dated_futures_terms_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_dated_futures_terms_ck"
  CHECK (
    (
      "kind" <> 'futures'
      AND "futures_contract_style" IS NULL
      AND "futures_expiry_at" IS NULL
      AND "futures_settlement_fixing" IS NULL
    )
    OR
    (
      "kind" = 'futures'
      AND (
        (
          ("futures_contract_style" IS NULL OR "futures_contract_style" = 'perpetual')
          AND "futures_expiry_at" IS NULL
          AND "futures_settlement_fixing" IS NULL
        )
        OR
        (
          "futures_contract_style" = 'dated'
          AND "futures_expiry_at" IS NOT NULL
          AND "futures_settlement_fixing" IS NOT NULL
          AND length(btrim("futures_settlement_fixing")) > 0
        )
      )
    )
  );

COMMENT ON CONSTRAINT "markets_dated_futures_terms_ck" ON "trade"."markets" IS
  'kind=futures dated requires expiry + non-empty futures_settlement_fixing; perpetuals and non-futures carry none. Blocks half-listed dated futures.';
