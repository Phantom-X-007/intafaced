-- trade.futures · ADL disclosure acks (D26-P1-T1g / DIRECTION:34)
-- Reversal: 0024_futures_adl_disclosure.down.sql
--
-- Ack only — no thresholds, ranking, or money. D5 owner numbers stay unset.

CREATE TABLE IF NOT EXISTS "trade"."adl_disclosure_acks" (
  "user_id"          uuid PRIMARY KEY,
  "version"          text NOT NULL,
  "acknowledged_at"  timestamptz NOT NULL,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "adl_disclosure_acks_version_idx"
  ON "trade"."adl_disclosure_acks" ("version");

-- Observable ADL disclosure-before-action log (no balances).
CREATE TABLE IF NOT EXISTS "trade"."adl_action_disclosures" (
  "event_id"                uuid PRIMARY KEY,
  "at"                      timestamptz NOT NULL,
  "version"                 text NOT NULL,
  "bankrupt_position_id"    uuid NOT NULL,
  "candidate_position_id"   uuid NOT NULL,
  "candidate_user_id"       uuid NOT NULL,
  "size_to_reduce"          numeric(38, 18) NOT NULL,
  "before_action"           boolean NOT NULL DEFAULT true,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "adl_action_disclosures_before_ck" CHECK ("before_action" = true),
  CONSTRAINT "adl_action_disclosures_size_ck" CHECK ("size_to_reduce" > 0)
);

CREATE INDEX IF NOT EXISTS "adl_action_disclosures_user_idx"
  ON "trade"."adl_action_disclosures" ("candidate_user_id", "at" DESC);

CREATE INDEX IF NOT EXISTS "adl_action_disclosures_bankrupt_idx"
  ON "trade"."adl_action_disclosures" ("bankrupt_position_id");
