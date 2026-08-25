-- svc-identity · bind an exchange API key to one account (sub-account)
-- Reversal: 0019_api_keys_account_id.down.sql
--
-- Mint/bind requires an account id. Auth that names another account refuses.
-- Empty account id refuses — never invent primary. Existing keys stay NULL
-- (legacy exchange still works until bound).

ALTER TABLE "identity"."api_keys"
  ADD COLUMN IF NOT EXISTS "account_id" uuid;

ALTER TABLE "identity"."api_keys"
  DROP CONSTRAINT IF EXISTS "api_keys_account_id_fkey";

ALTER TABLE "identity"."api_keys"
  ADD CONSTRAINT "api_keys_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "identity"."sub_accounts"("id");

CREATE INDEX IF NOT EXISTS "api_keys_account_idx"
  ON "identity"."api_keys" ("account_id")
  WHERE "account_id" IS NOT NULL;
