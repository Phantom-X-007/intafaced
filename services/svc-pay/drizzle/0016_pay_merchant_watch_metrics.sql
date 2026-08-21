-- Operator-published merchant approval-rate samples for svc-agents merchant watch.
-- Not money — only durable metrics the operator POSTs via S2S publish.
-- Empty table = honest `no_live_metrics` on GET; never seeded with fake rates.

CREATE TABLE IF NOT EXISTS "pay"."merchant_watch_metrics" (
  "rail_id" text PRIMARY KEY,
  "approval_rate" text,
  "attempts" integer,
  "as_of" timestamptz NOT NULL,
  "max_age_ms" integer NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now()
);
