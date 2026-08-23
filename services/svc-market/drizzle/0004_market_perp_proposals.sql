-- Perpetual market proposals are metadata, not markets and not a money book.
-- Creation is never orderable. Promotion remains an explicit later authority.
CREATE TABLE IF NOT EXISTS "market"."perp_proposals" (
  "id"             uuid PRIMARY KEY,
  "proposer_id"    uuid NOT NULL,
  "symbol"         text NOT NULL CHECK (length(btrim("symbol")) > 0 AND length("symbol") <= 80),
  "settle"         text NOT NULL CHECK (length(btrim("settle")) > 0 AND length("settle") <= 128),
  "oracle_source"  text NOT NULL CHECK (length(btrim("oracle_source")) > 0 AND length("oracle_source") <= 256),
  "leverage_cap"   numeric(38, 18) NOT NULL CHECK ("leverage_cap" > 0),
  "status"         text NOT NULL DEFAULT 'proposed'
    CHECK ("status" IN ('proposed', 'listed_unorderable', 'orderable')),
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "perp_proposals_proposer_idx"
  ON "market"."perp_proposals" ("proposer_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "market"."perp_proposal_status_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" uuid NOT NULL REFERENCES "market"."perp_proposals"("id"),
  "from_status" text CHECK ("from_status" IS NULL OR "from_status" IN ('proposed', 'listed_unorderable', 'orderable')),
  "to_status"   text NOT NULL CHECK ("to_status" IN ('proposed', 'listed_unorderable', 'orderable')),
  "actor_id"    uuid NOT NULL,
  "reason"      text NOT NULL CHECK (length(btrim("reason")) > 0),
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "perp_proposal_events_proposal_idx"
  ON "market"."perp_proposal_status_events" ("proposal_id", "created_at" ASC, "id" ASC);
