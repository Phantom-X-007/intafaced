DROP TABLE IF EXISTS "pay"."checkout_sessions";
DROP TYPE IF EXISTS "pay"."checkout_session_status";

ALTER TABLE "pay"."payment_links" DROP CONSTRAINT IF EXISTS "payment_links_uses_non_negative";
ALTER TABLE "pay"."payment_links" DROP CONSTRAINT IF EXISTS "payment_links_max_uses_positive";
ALTER TABLE "pay"."payment_links" DROP COLUMN IF EXISTS "uses";
ALTER TABLE "pay"."payment_links" DROP COLUMN IF EXISTS "max_uses";
