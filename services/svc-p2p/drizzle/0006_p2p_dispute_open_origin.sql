-- svc-p2p · honest origin of a dispute open.
-- Reversal: 0006_p2p_dispute_open_origin.down.sql
--
-- NOT tagged `intafaced:destructive`: adds a constrained column with a default.
--
-- Audit P3 (2026-08-08): when the fiat_sent clock opens a dispute, the service
-- wrote opened_by = buyerId. Nobody opened it; the clock did. Moderators then
-- saw a party attributed with a filing they never made. Neighbouring columns
-- (moderator_id) refuse system principals, so the fix is a separate origin
-- enum — not inventing a system: opener. opened_by stays the party of interest
-- (the buyer who marked fiat sent); opened_via tells the truth about who filed.

ALTER TABLE "p2p"."p2p_disputes"
  ADD COLUMN IF NOT EXISTS "opened_via" text NOT NULL DEFAULT 'party';

ALTER TABLE "p2p"."p2p_disputes" DROP CONSTRAINT IF EXISTS "p2p_disputes_opened_via_ck";
ALTER TABLE "p2p"."p2p_disputes" ADD CONSTRAINT "p2p_disputes_opened_via_ck"
  CHECK ("opened_via" IN ('party', 'timeout'));
