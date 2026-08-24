DROP INDEX IF EXISTS "trade"."market_lifecycle_evidence_publication_idx";
DROP INDEX IF EXISTS "trade"."market_lifecycle_evidence_genesis_unique";
DROP INDEX IF EXISTS "trade"."market_lifecycle_evidence_predecessor_unique";
ALTER TABLE "trade"."market_lifecycle_evidence" DROP CONSTRAINT IF EXISTS "market_lifecycle_evidence_payload_ck";
ALTER TABLE "trade"."market_lifecycle_evidence"
  ADD CONSTRAINT "market_lifecycle_evidence_payload_ck"
  CHECK (("evidence_kind" = 'TRANSITION' AND "transition" IS NOT NULL AND "correction" IS NULL)
      OR ("evidence_kind" = 'CORRECTION' AND "transition" IS NULL AND "correction" IS NOT NULL));
ALTER TABLE "trade"."market_lifecycle_evidence" DROP CONSTRAINT IF EXISTS "market_lifecycle_evidence_kind_ck";
ALTER TABLE "trade"."market_lifecycle_evidence"
  ADD CONSTRAINT "market_lifecycle_evidence_kind_ck" CHECK ("evidence_kind" IN ('TRANSITION', 'CORRECTION'));
ALTER TABLE "trade"."market_lifecycle_evidence" DROP COLUMN IF EXISTS "publication";
