-- intafaced:destructive — reversal of 0023_org_risk_manager.sql
--
-- risk-manager seats become auditor (read-only, cannot place). Restores
-- admin/trader/auditor CHECK.

UPDATE "identity"."organization_members" SET "role" = 'auditor' WHERE "role" = 'risk-manager';

ALTER TABLE "identity"."organization_members" DROP CONSTRAINT IF EXISTS "organization_members_role_ck";
ALTER TABLE "identity"."organization_members" ADD CONSTRAINT "organization_members_role_ck"
  CHECK ("role" IN ('admin', 'trader', 'auditor'));
