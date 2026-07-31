-- Hashed TOTP recovery codes (ID-P1-1). Plaintext is shown once at enrolment;
-- only hashes live in the database.
ALTER TABLE "identity"."users"
  ADD COLUMN IF NOT EXISTS "recovery_code_hashes" jsonb NOT NULL DEFAULT '[]'::jsonb;
