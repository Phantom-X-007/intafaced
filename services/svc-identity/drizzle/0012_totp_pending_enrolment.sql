-- Pending TOTP enrolment — durable so multi-pod identity can confirm when
-- start was issued on a different instance. Single-use take on confirm.
-- Holds only secret_hash + recovery hashes (never plaintext secret).
-- TTL: expires_at; prune on put/take.
CREATE TABLE IF NOT EXISTS "identity"."totp_pending_enrolments" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "secret_hash" text NOT NULL,
  "recovery_code_hashes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "totp_pending_enrolments_expires_idx"
  ON "identity"."totp_pending_enrolments" ("expires_at");
