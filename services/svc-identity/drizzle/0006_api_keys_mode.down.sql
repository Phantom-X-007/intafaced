-- intafaced:destructive — reversal of 0006_api_keys_mode.sql

ALTER TABLE "identity"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_mode_check";
ALTER TABLE "identity"."api_keys" DROP COLUMN IF EXISTS "mode";
