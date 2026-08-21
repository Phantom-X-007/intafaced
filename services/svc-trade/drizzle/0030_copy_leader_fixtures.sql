-- Operator-published copy-leader performance fixtures for svc-agents copy-intel.
-- Not money — only audited stats rows the operator POSTs via S2S publish.
-- Empty table = honest `no_live_leaders` on GET; never seeded with fake PnL.

CREATE TABLE IF NOT EXISTS "trade"."copy_leader_fixtures" (
  "leader_id" text PRIMARY KEY,
  "realised_pnl" text,
  "closed_trades" integer,
  "winning_trades" integer,
  "window_start" timestamptz NOT NULL,
  "window_end" timestamptz NOT NULL,
  "source" text NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now()
);
