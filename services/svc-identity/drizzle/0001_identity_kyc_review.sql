-- KYC REVIEW TRAIL (§4.1, §9).
--
-- `approveKyc` existed on no router and no route, so every account on the
-- platform sat at tier `none` forever and every custodial module was
-- unreachable. Routing it needs one thing the table does not have: a record of
-- WHICH OPERATOR granted the tier.
--
-- That is not bookkeeping. `kyc_records.tier` is what `checkAccess` reads, so
-- approving a record is granting access to every custodial module in the OS.
-- "Who made that grant" has to be answerable from the row, not from a log
-- somebody has to still have.
--
-- Additive and nullable: existing approved records predate the routed flow and
-- have no reviewer to name. Backfilling them with a guess would invent an
-- accountable party, which is worse than an honest NULL.

ALTER TABLE "identity"."kyc_records" ADD COLUMN IF NOT EXISTS "reviewed_by" text;

-- A reviewed record names its reviewer. Applied only to rows this migration did
-- not inherit: NOT VALID skips the existing backlog, so the constraint governs
-- every future write without rewriting history it cannot know.
ALTER TABLE "identity"."kyc_records" DROP CONSTRAINT IF EXISTS "kyc_reviewed_by_ck";
ALTER TABLE "identity"."kyc_records" ADD CONSTRAINT "kyc_reviewed_by_ck"
  CHECK ("status" = 'pending' OR "reviewed_at" IS NOT NULL) NOT VALID;

-- THE OPERATOR QUEUE. Every record waiting on a human, oldest first. Without it
-- the compliance queue is a sequential scan of every KYC record ever filed.
CREATE INDEX IF NOT EXISTS "kyc_pending_idx" ON "identity"."kyc_records" ("status", "created_at");
