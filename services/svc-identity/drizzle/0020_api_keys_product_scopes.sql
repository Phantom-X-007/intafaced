-- svc-identity · bind a product/module scope list on an API key
-- Reversal: 0020_api_keys_product_scopes.down.sql
--
-- Empty list stays unset (full grantor intersection; no default product).
-- Non-empty list: exchange/use outside the list refuses. Bind cannot widen
-- past grantor modules. Known modules only (scope prefix).

ALTER TABLE "identity"."api_keys"
  ADD COLUMN IF NOT EXISTS "product_scopes" text[] NOT NULL DEFAULT '{}';
