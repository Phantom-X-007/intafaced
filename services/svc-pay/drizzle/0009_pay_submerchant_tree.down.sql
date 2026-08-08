-- intafaced:destructive — reversal of 0009_pay_submerchant_tree.sql
--
-- Dropping `parent_merchant_id` FLATTENS THE TREE. Every sub-merchant survives
-- as an unrelated top-level merchant, and nothing anywhere records that it was
-- ever under anyone — so a payfac's book of sub-merchants becomes a set of
-- strangers who happen to have accounts. Dropping the permission journal
-- destroys the only record of who was ever delegated authority over whom, and
-- by which node.
--
-- It exists so the migration is provably reversible in CI against a scratch
-- schema (§14). Against a database with real merchants it is not recoverable
-- from anywhere else: the ledger holds the money, not the relationships.

DROP TRIGGER IF EXISTS "merchant_permission_events_append_only_trg" ON "pay"."merchant_permission_events";
DROP TABLE IF EXISTS "pay"."merchant_permission_events";
DROP FUNCTION IF EXISTS "pay"."merchant_permission_events_append_only"();

DROP INDEX IF EXISTS "pay"."merchants_parent_idx";

ALTER TABLE "pay"."merchants"
  DROP CONSTRAINT IF EXISTS "merchants_parent_not_self";

ALTER TABLE "pay"."merchants"
  DROP COLUMN IF EXISTS "parent_merchant_id",
  DROP COLUMN IF EXISTS "settling_party";
