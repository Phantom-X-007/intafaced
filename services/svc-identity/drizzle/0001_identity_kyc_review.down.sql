-- intafaced:destructive — reversal of 0001_identity_kyc_review.sql
--
-- Dropping `reviewed_by` erases the record of WHICH OPERATOR granted each
-- verification tier. The tiers themselves survive, so nobody loses access — but
-- the accountability for who granted them does not come back, and it is not
-- reconstructible from anywhere else in this schema.
--
-- Safe to run in CI against a scratch schema, which is what it is for (§14).
-- Against a database that has served a real approval, this is a one-way loss of
-- an audit trail a regulator would ask for by name.

DROP INDEX IF EXISTS "identity"."kyc_pending_idx";

ALTER TABLE "identity"."kyc_records" DROP CONSTRAINT IF EXISTS "kyc_reviewed_by_ck";

ALTER TABLE "identity"."kyc_records" DROP COLUMN IF EXISTS "reviewed_by";
