-- WebAuthn ceremony challenges — durable so multi-pod identity can complete
-- registration/assertion when options were issued on a different instance.
-- Single-use: take() deletes the row. TTL: expires_at; prune on put/take.
CREATE TABLE IF NOT EXISTS "identity"."webauthn_challenges" (
  "challenge"  text PRIMARY KEY NOT NULL,
  "kind"       text NOT NULL,
  "user_id"    uuid,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "webauthn_challenges_kind_ck"
    CHECK ("kind" IN ('registration', 'authentication', 'step-up'))
);

CREATE INDEX IF NOT EXISTS "webauthn_challenges_expires_idx"
  ON "identity"."webauthn_challenges" ("expires_at");
