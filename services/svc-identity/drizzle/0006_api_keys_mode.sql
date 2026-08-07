-- intafaced:additive — api key sandbox vs live mode (pay.public-api step 4)
-- Reversal: 0006_api_keys_mode.down.sql
--
-- ADR 2026-08-07 §2.5 / §4 step 4: a sandbox key routes to the sandbox rail;
-- a live key may not. Mode is stored on the key row and minted into the short
-- access token as `key_env`. Default `live` keeps existing keys honest.

ALTER TABLE "identity"."api_keys"
  ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'live';

-- Existing rows already defaulted. Constrain new values.
ALTER TABLE "identity"."api_keys"
  DROP CONSTRAINT IF EXISTS "api_keys_mode_check";

ALTER TABLE "identity"."api_keys"
  ADD CONSTRAINT "api_keys_mode_check" CHECK ("mode" IN ('live', 'sandbox'));
