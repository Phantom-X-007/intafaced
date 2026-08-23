-- Reverse 0007_p2p_dispute_chat_thread.sql

ALTER TABLE "p2p"."p2p_disputes" DROP COLUMN IF EXISTS "chat_thread_id";
