-- intafaced:destructive — reversal of 0000_academy_init.sql
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14). It must NEVER be run against a database with live users.
--
-- Nothing of anyone's MONEY is here to lose — this service holds none. What
-- dies is every earned thing: which paths people completed, which rooms they
-- were invited to, and which certifications were awarded.
--
-- The certifications are the dangerous part. XP for them has already been
-- published to svc-identity and is already in someone's rank; without these
-- rows, `certifications_pk` no longer refuses a second award, and a re-run of
-- the same curriculum would publish the XP a second time under a fresh key.
-- The credential would be re-earnable, and the ladder would inflate.
--
-- The "academy" schema itself is left in place: the bootstrap owns it, not this
-- migration (§2), and this role has no DROP SCHEMA privilege anyway.

DROP TABLE IF EXISTS "academy"."certifications";
DROP TABLE IF EXISTS "academy"."item_progress";
DROP TABLE IF EXISTS "academy"."enrollments";
DROP TABLE IF EXISTS "academy"."curriculum_items";
DROP TABLE IF EXISTS "academy"."curricula";
DROP TABLE IF EXISTS "academy"."session_attendees";
DROP TABLE IF EXISTS "academy"."sessions";
DROP TABLE IF EXISTS "academy"."room_invites";
DROP TABLE IF EXISTS "academy"."rooms";

DROP TYPE IF EXISTS "academy"."enrollment_status";
DROP TYPE IF EXISTS "academy"."curriculum_item_kind";
DROP TYPE IF EXISTS "academy"."attendee_role";
DROP TYPE IF EXISTS "academy"."session_status";
DROP TYPE IF EXISTS "academy"."room_access";
DROP TYPE IF EXISTS "academy"."room_kind";
