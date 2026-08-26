-- svc-identity · org roles admin / trader / auditor (M01)
-- Reversal: 0022_org_roles.down.sql
--
-- Admin can add members. Trader cannot. Auditor cannot place.
-- Missing / unknown role refuses. owner → admin; member → trader.

ALTER TABLE "identity"."organization_members" DROP CONSTRAINT IF EXISTS "organization_members_role_ck";

UPDATE "identity"."organization_members" SET "role" = 'admin' WHERE "role" = 'owner';
UPDATE "identity"."organization_members" SET "role" = 'trader' WHERE "role" = 'member';

ALTER TABLE "identity"."organization_members" ADD CONSTRAINT "organization_members_role_ck"
  CHECK ("role" IN ('admin', 'trader', 'auditor'));
