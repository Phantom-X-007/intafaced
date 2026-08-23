-- svc-identity · affiliate share tokens (ops.social-promotion)
-- Reversal: 0017_affiliate_share_tokens.down.sql
--
-- Token → referrer id + hit counter. NOT a second attribution tree.
-- Attribution stays on identity.referral_edges via affiliates.attribute.
-- Missing/closed referrer is a named refuse (share.profile_gone), not a silent hit.

CREATE TABLE IF NOT EXISTS "identity"."affiliate_share_tokens" (
  "token"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_id"  uuid NOT NULL,
  "hits"         integer NOT NULL DEFAULT 0,
  "revoked_at"   timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "affiliate_share_tokens_hits_ck" CHECK ("hits" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_share_tokens_active_referrer_uidx"
  ON "identity"."affiliate_share_tokens" ("referrer_id")
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "affiliate_share_tokens_referrer_idx"
  ON "identity"."affiliate_share_tokens" ("referrer_id", "created_at" DESC);
