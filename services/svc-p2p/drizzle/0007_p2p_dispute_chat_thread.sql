-- svc-p2p · persist the dispute chat thread id.
-- Reversal: 0007_p2p_dispute_chat_thread.down.sql
--
-- NOT tagged `intafaced:destructive`: adds a nullable uuid column.
--
-- p2p_trades has carried chat_thread_id since 0000. p2p_disputes did not, so
-- disputes.open could not persist or return a thread. A uuid here is a thread
-- identifier, not a transcript — empty chat stays empty.

ALTER TABLE "p2p"."p2p_disputes"
  ADD COLUMN IF NOT EXISTS "chat_thread_id" uuid;
