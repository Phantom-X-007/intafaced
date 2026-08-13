-- Reverse 0006_p2p_dispute_open_origin.sql

ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_opened_via_ck";
ALTER TABLE "p2p"."p2p_disputes" DROP COLUMN IF EXISTS "opened_via";
