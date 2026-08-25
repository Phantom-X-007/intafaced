-- Reverse 0019_api_keys_account_id.sql
ALTER TABLE "identity"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_account_id_fkey";
DROP INDEX IF EXISTS "identity"."api_keys_account_idx";
ALTER TABLE "identity"."api_keys" DROP COLUMN IF EXISTS "account_id";
