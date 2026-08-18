-- Align api_keys DB backstop with INTERACTIVE_ONLY_SCOPES.
-- pay:payout is interactive-only (§9) — a leaked bot key must not hold it.
-- Service assertKeyScopesAllowed already refuses it; this is the DB CHECK half.
ALTER TABLE "identity"."api_keys" DROP CONSTRAINT IF EXISTS "api_keys_no_withdraw_ck";
ALTER TABLE "identity"."api_keys" ADD CONSTRAINT "api_keys_no_withdraw_ck"
  CHECK (NOT ("scopes" && ARRAY['trade:withdraw', 'admin:treasury', 'bank:card', 'pay:payout']));
