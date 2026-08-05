-- Reversal of 0002_p2p_instrument_field_guard.sql.
--
-- NOT tagged `intafaced:destructive`: this drops no table, no column and no row.
-- It puts the field-list guard back to the weaker rule `0001` shipped, which is
-- a loss of protection rather than a loss of data.
--
-- It exists so the migration is provably reversible in CI (§14 DoD 1). What it
-- costs if run anywhere real is worth naming, because it is easy to read this
-- file as harmless: afterwards the column accepts any non-empty JSON array
-- again, so a field list with no `key`, no `label`, a duplicate key or a pattern
-- past `MAX_PATTERN_LENGTH` can be written by anything that can reach the table.
-- The read-side re-validation in `toSchema` still refuses such a row, so the
-- service stays fail-closed — but it refuses it at every read, rather than the
-- write being rejected once at the moment it was wrong.

-- Back to the 0001 guard, verbatim.
ALTER TABLE "p2p"."payment_method_schemas" DROP CONSTRAINT IF EXISTS "payment_method_schemas_fields_ck";
ALTER TABLE "p2p"."payment_method_schemas" ADD CONSTRAINT "payment_method_schemas_fields_ck"
  CHECK (jsonb_typeof("fields") = 'array' AND jsonb_array_length("fields") > 0);

-- After the constraint, because the constraint depended on it.
DROP FUNCTION IF EXISTS "p2p"."payment_method_fields_are_well_formed"(jsonb);
