-- Merchant KYB stub surface (Board Clear pay.gateway Done bar).
-- Full digital KYB is pay.psp; this column is the merchant-supplied reference only.
ALTER TABLE "pay"."merchants" ADD COLUMN IF NOT EXISTS "kyb_ref" text;
