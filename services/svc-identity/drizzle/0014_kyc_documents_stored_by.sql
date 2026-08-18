-- §10 compliance audit: who put the encrypted document (operator id), never the document itself.
ALTER TABLE "identity"."kyc_documents"
  ADD COLUMN IF NOT EXISTS "stored_by" text;
