-- TOTP last-used step (anti-replay inside the validity window).
-- A captured code must not re-authenticate login or step-up until the window advances.
ALTER TABLE "identity"."users"
  ADD COLUMN IF NOT EXISTS "totp_last_step" bigint;
