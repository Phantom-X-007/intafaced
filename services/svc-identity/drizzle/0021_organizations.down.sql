-- intafaced:destructive — reversal of 0021_organizations.sql
--
-- Drops membership then orgs. No balances lived here.

DROP INDEX IF EXISTS "identity"."organization_members_user_idx";
DROP INDEX IF EXISTS "identity"."organization_members_pk";
DROP TABLE IF EXISTS "identity"."organization_members";
DROP INDEX IF EXISTS "identity"."organizations_created_by_idx";
DROP TABLE IF EXISTS "identity"."organizations";
