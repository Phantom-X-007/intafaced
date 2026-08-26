-- svc-identity · organizations + membership (M01 slice)
-- Reversal: 0021_organizations.down.sql
--
-- An org is a named membership boundary. No balance, no ledger, no KYC
-- shortcut. Missing org/member id refuses. Membership in A cannot act as B.

CREATE TABLE IF NOT EXISTS "identity"."organizations" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "identity"."users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "identity"."organizations" DROP CONSTRAINT IF EXISTS "organizations_name_shape_ck";
ALTER TABLE "identity"."organizations" ADD CONSTRAINT "organizations_name_shape_ck"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 128);

CREATE INDEX IF NOT EXISTS "organizations_created_by_idx"
  ON "identity"."organizations" ("created_by");

CREATE TABLE IF NOT EXISTS "identity"."organization_members" (
  "org_id"     uuid NOT NULL REFERENCES "identity"."organizations"("id") ON DELETE CASCADE,
  "user_id"    uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "role"       text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "identity"."organization_members" DROP CONSTRAINT IF EXISTS "organization_members_role_ck";
ALTER TABLE "identity"."organization_members" ADD CONSTRAINT "organization_members_role_ck"
  CHECK ("role" IN ('owner', 'member'));

CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_pk"
  ON "identity"."organization_members" ("org_id", "user_id");

CREATE INDEX IF NOT EXISTS "organization_members_user_idx"
  ON "identity"."organization_members" ("user_id");
