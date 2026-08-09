-- Reverse 0017_options_contract_terms.sql

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_options_terms_ck";

ALTER TABLE "trade"."markets"
  DROP COLUMN IF EXISTS "settlement_fixing",
  DROP COLUMN IF EXISTS "option_expiry_at",
  DROP COLUMN IF EXISTS "option_strike",
  DROP COLUMN IF EXISTS "option_style",
  DROP COLUMN IF EXISTS "option_type";

DROP TYPE IF EXISTS "trade"."option_style";
DROP TYPE IF EXISTS "trade"."option_type";
