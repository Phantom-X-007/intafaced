-- Reverse 0045_dated_futures_terms.sql

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_dated_futures_terms_ck";

ALTER TABLE "trade"."markets"
  DROP COLUMN IF EXISTS "futures_settlement_fixing",
  DROP COLUMN IF EXISTS "futures_expiry_at",
  DROP COLUMN IF EXISTS "futures_contract_style";

DROP TYPE IF EXISTS "trade"."futures_contract_style";
