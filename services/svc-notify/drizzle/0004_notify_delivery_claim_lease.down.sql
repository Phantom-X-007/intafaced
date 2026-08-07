-- Reversal of 0004_notify_delivery_claim_lease.sql

DROP INDEX IF EXISTS "notify"."deliveries_lease_idx";
ALTER TABLE "notify"."deliveries" DROP COLUMN IF EXISTS "lease_until";
