-- trade.copy · follower pause/stop/detach (PTX-M26-R05)
-- Reversal: 0041_copy_follow_relationship_state.down.sql
--
-- ACTIVE ↔ PAUSED → STOPPING → DETACHED. Pause fences new mirrors immediately
-- without inventing a flatten. Existing rows are ACTIVE.

ALTER TABLE "trade"."copy_follows"
  ADD COLUMN IF NOT EXISTS "relationship_state" text NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "trade"."copy_follows"
  DROP CONSTRAINT IF EXISTS "copy_follows_relationship_state_ck";

ALTER TABLE "trade"."copy_follows"
  ADD CONSTRAINT "copy_follows_relationship_state_ck"
  CHECK ("relationship_state" IN ('ACTIVE', 'PAUSED', 'STOPPING', 'DETACHED'));
