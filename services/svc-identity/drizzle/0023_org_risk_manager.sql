-- svc-identity · org role risk-manager (M01)
-- Reversal: 0023_org_risk_manager.down.sql
--
-- Distinct from auditor: can see risk, cannot place, cannot add members.
-- Missing / unknown role still refuses.

ALTER TABLE "identity"."organization_members" DROP CONSTRAINT IF EXISTS "organization_members_role_ck";

ALTER TABLE "identity"."organization_members" ADD CONSTRAINT "organization_members_role_ck"
  CHECK ("role" IN ('admin', 'trader', 'auditor', 'risk-manager'));
