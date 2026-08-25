-- Reverse 0020_api_keys_product_scopes.sql
ALTER TABLE "identity"."api_keys" DROP COLUMN IF EXISTS "product_scopes";
