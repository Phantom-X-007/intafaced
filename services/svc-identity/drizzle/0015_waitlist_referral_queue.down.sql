ALTER TABLE "identity"."waitlist_entries" DROP CONSTRAINT IF EXISTS "waitlist_entries_referred_by_fk";
DROP TABLE IF EXISTS "identity"."waitlist_entries";
