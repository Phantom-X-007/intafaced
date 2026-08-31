-- svc-p2p · block/RFQ capacity + firmness labels (PTX-M12-R01/R02).
-- Reversal: 0009_p2p_block_rfq_capacity_firmness.down.sql
--
-- NOT tagged `intafaced:destructive`: new columns/types.
--
-- Capacity is caller-labeled principal | matched_principal | agency. There is
-- no default — unlabeled rows refuse rather than invent the house model.
-- Firmness is only `firm`. Last look cannot be stored.

DO $$ BEGIN
  CREATE TYPE "p2p"."block_quote_capacity" AS ENUM ('principal', 'matched_principal', 'agency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "p2p"."block_quote_firmness" AS ENUM ('firm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "p2p"."block_quotes") THEN
    RAISE EXCEPTION 'p2p.block_quotes has rows without capacity/firmness — refuse rather than invent principal or firm';
  END IF;
END $$;

ALTER TABLE "p2p"."block_quotes" ADD COLUMN IF NOT EXISTS "capacity" "p2p"."block_quote_capacity" NOT NULL;
ALTER TABLE "p2p"."block_quotes" ADD COLUMN IF NOT EXISTS "firmness" "p2p"."block_quote_firmness" NOT NULL;
