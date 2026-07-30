-- Payment links (§6.1 hosted checkout pointer). Public resolve by token hash.
CREATE TABLE IF NOT EXISTS "pay"."payment_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL REFERENCES "pay"."merchants"("id"),
  "profile_id" uuid REFERENCES "pay"."payment_profiles"("id"),
  "token_hash" text NOT NULL,
  "token_prefix" text NOT NULL,
  "label" text NOT NULL,
  "amount" numeric(40, 18),
  "currency" text,
  "active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_links_token_hash_idx" ON "pay"."payment_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "payment_links_merchant_idx" ON "pay"."payment_links" ("merchant_id");
