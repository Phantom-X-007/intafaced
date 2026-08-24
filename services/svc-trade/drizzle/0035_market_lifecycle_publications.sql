-- Durable PX-S01 authority/dossier publications. Rows are immutable evidence;
-- corrections are separate rows linked by causal_predecessor_id.
ALTER TABLE "trade"."market_lifecycle_evidence"
  ADD COLUMN IF NOT EXISTS "publication" jsonb;
ALTER TABLE "trade"."market_lifecycle_evidence"
  ALTER COLUMN "causal_predecessor_id" DROP NOT NULL;
ALTER TABLE "trade"."market_lifecycle_evidence"
  DROP CONSTRAINT IF EXISTS "market_lifecycle_evidence_kind_ck";
ALTER TABLE "trade"."market_lifecycle_evidence"
  ADD CONSTRAINT "market_lifecycle_evidence_kind_ck"
  CHECK ("evidence_kind" IN ('TRANSITION', 'CORRECTION', 'AUTHORITY_DOSSIER'));
ALTER TABLE "trade"."market_lifecycle_evidence"
  DROP CONSTRAINT IF EXISTS "market_lifecycle_evidence_payload_ck";
ALTER TABLE "trade"."market_lifecycle_evidence"
  ADD CONSTRAINT "market_lifecycle_evidence_payload_ck"
  CHECK (("evidence_kind" = 'TRANSITION' AND "transition" IS NOT NULL AND "correction" IS NULL AND "publication" IS NULL)
      OR ("evidence_kind" = 'CORRECTION' AND "transition" IS NULL AND "correction" IS NOT NULL AND "publication" IS NULL)
      OR ("evidence_kind" = 'AUTHORITY_DOSSIER' AND "transition" IS NULL AND "correction" IS NULL AND "publication" IS NOT NULL));
CREATE INDEX IF NOT EXISTS "market_lifecycle_evidence_publication_idx"
  ON "trade"."market_lifecycle_evidence" ("market_id", "evidence_kind", "observed_at" DESC);
-- A publication chain is a single-parent append-only DAG: one genesis and one
-- child per predecessor. These indexes close the SELECT-then-INSERT fork race.
CREATE UNIQUE INDEX IF NOT EXISTS "market_lifecycle_evidence_genesis_unique"
  ON "trade"."market_lifecycle_evidence" ("market_id")
  WHERE "evidence_kind" = 'AUTHORITY_DOSSIER' AND "causal_predecessor_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "market_lifecycle_evidence_predecessor_unique"
  ON "trade"."market_lifecycle_evidence" ("market_id", "causal_predecessor_id")
  WHERE "evidence_kind" = 'AUTHORITY_DOSSIER' AND "causal_predecessor_id" IS NOT NULL;
