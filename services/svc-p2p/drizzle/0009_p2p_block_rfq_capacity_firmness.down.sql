-- Reverse 0009_p2p_block_rfq_capacity_firmness.sql

ALTER TABLE "p2p"."block_quotes" DROP COLUMN IF EXISTS "capacity";
ALTER TABLE "p2p"."block_quotes" DROP COLUMN IF EXISTS "firmness";
DROP TYPE IF EXISTS "p2p"."block_quote_capacity";
DROP TYPE IF EXISTS "p2p"."block_quote_firmness";
