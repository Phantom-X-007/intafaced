-- §10 PII isolation: KYC document bytes live here, never on kyc_records.
-- provider_ref on kyc_records points at id; services get flags only.
CREATE TABLE IF NOT EXISTS "identity"."kyc_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "identity"."users"("id") ON DELETE CASCADE,
  "content_type" text NOT NULL,
  "byte_length" integer NOT NULL,
  "ciphertext" bytea NOT NULL,
  "nonce" bytea NOT NULL,
  "key_id" text NOT NULL DEFAULT 'v1',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "kyc_documents_byte_length_ck" CHECK ("byte_length" > 0 AND "byte_length" <= 10485760)
);

CREATE INDEX IF NOT EXISTS "kyc_documents_user_idx" ON "identity"."kyc_documents" ("user_id", "created_at");
