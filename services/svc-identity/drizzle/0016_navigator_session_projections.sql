-- Operator-published navigator session projections for svc-agents identity.session.read.
-- Not auth truth — only rows the operator POSTs for the agents live plane.
-- Missing row = honest `no_live_session_store` on GET; never seeded with fake sessions.

CREATE TABLE IF NOT EXISTS "identity"."navigator_session_projections" (
  "session_id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('open', 'closed')),
  "published_at" timestamptz NOT NULL DEFAULT now()
);
