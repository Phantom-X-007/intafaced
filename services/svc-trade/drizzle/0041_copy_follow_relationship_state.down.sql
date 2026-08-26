-- intafaced:destructive — reversal of 0041_copy_follow_relationship_state.sql

ALTER TABLE "trade"."copy_follows"
  DROP CONSTRAINT IF EXISTS "copy_follows_relationship_state_ck";

ALTER TABLE "trade"."copy_follows"
  DROP COLUMN IF EXISTS "relationship_state";
