-- trade.algo · persist the createTwap place grant (scopes/session/tier)
-- Reversal: 0025_algo_principal_grant.down.sql
--
-- Never a JWT or secret. Missing grant (old rows) still halt
-- trade.algo_principal_unavailable. Never mint from user_id alone.

ALTER TABLE "trade"."algo_parents"
  ADD COLUMN IF NOT EXISTS "grant_claims" jsonb;
