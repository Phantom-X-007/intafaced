-- ═════════════════════════════════════════════════════════════════════════════
-- THE FIELD LIST IS CHECKED BY THE DATABASE, NOT ONLY BY THE SERVICE.
--
-- `0001` shipped this column with one guard: "is a non-empty JSON array". Every
-- other rule an operator's field list is held to — key shape, label, field
-- count, length bounds, the pattern cap — lived in `parseFieldSpecs()` in
-- TypeScript, which made each of them a property of ONE CODE PATH rather than
-- of the data. A migration, a fix-up script, a psql session or a future writer
-- in this service could put anything at all in this column, and `toSchema` cast
-- it straight to `FieldSpec[]`. "Only an operator with admin:compliance can
-- write here" is a statement about who is holding the door, not a constraint,
-- and it stops being true the first time a scope widens.
--
-- WHY THIS IS 0002 AND NOT AN EDIT TO 0001. `0001` was still unmerged when this
-- work started, and editing it in place was sanctioned on that basis. It merged
-- with #428 while this branch was open. `scripts/migrate.ts` tracks applied
-- migrations BY FILENAME in `p2p.__migrations`, so an edit to `0001` would never
-- run again on any database that had already applied it — the constraint would
-- exist only on databases created after the edit, which is the worst of both
-- worlds: green tests and an unprotected production table.
--
-- WHAT SQL CAN AND CANNOT DO HERE. It can check the SHAPE of a field list at
-- write time, against every writer, which is what is below. It cannot decide
-- whether a `pattern` is a regular expression this service can run in linear
-- time — that question is answered by the matcher in `src/linear-pattern.ts`,
-- and it is answered again when the row is READ (see `toSchema` in
-- `src/instrument-service.ts`). Both halves are needed and neither subsumes the
-- other: this one catches a malformed row at the moment it is written whoever
-- writes it, and the read-side one catches the half only executable code can
-- decide.
--
-- A function rather than an inline expression because the check needs to walk
-- the array, and a CHECK constraint may not contain a sub-select. It is marked
-- IMMUTABLE, which is what makes it legal in a constraint at all.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "p2p"."payment_method_fields_are_well_formed"("fields" jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    -- A schema with no fields accepts an instrument with no details — an
    -- instrument the buyer cannot pay, which is the exact bug this table
    -- exists to make impossible. The upper bound is MAX_FIELDS.
    jsonb_typeof("fields") = 'array'
    AND jsonb_array_length("fields") BETWEEN 1 AND 24

    -- Every entry, against the same bounds parseFieldSpecs() applies.
    --
    -- COALESCE(…, false) is load-bearing, not defensive noise. An ABSENT key
    -- makes `jsonb_typeof(f -> 'label') = 'string'` evaluate to NULL rather than
    -- false; NULL propagates through the AND chain, `NOT NULL` is NULL, and a
    -- WHERE of NULL selects no row — so a field with no label at all passed a
    -- constraint written to require one. (It was caught in testing only because
    -- a missing `key` happened to also break the DISTINCT count below.) Treating
    -- "we could not evaluate this" as "not well formed" is the only reading of
    -- three-valued logic a constraint like this can safely have.
    AND NOT EXISTS (
      SELECT 1
        FROM jsonb_array_elements("fields") AS f
       WHERE NOT COALESCE(
             jsonb_typeof(f) = 'object'
         -- key: KEY_RE in instruments.ts
         AND jsonb_typeof(f -> 'key') = 'string'
         AND (f ->> 'key') ~ '^[a-z][a-z0-9_]{0,39}$'
         -- label: 1..MAX_LABEL_LENGTH, and not just whitespace
         AND jsonb_typeof(f -> 'label') = 'string'
         AND length(btrim(f ->> 'label')) BETWEEN 1 AND 120
         -- pattern: optional, but if present it is a bounded string.
         -- Whether it is SAFE TO RUN is not decidable here — see the note above.
         AND (f -> 'pattern' IS NULL
              OR (jsonb_typeof(f -> 'pattern') = 'string' AND length(f ->> 'pattern') BETWEEN 1 AND 200))
         -- lengths: optional integers within 1..MAX_VALUE_LENGTH, min <= max
         AND (f -> 'minLength' IS NULL
              OR (jsonb_typeof(f -> 'minLength') = 'number'
                  AND (f ->> 'minLength')::numeric BETWEEN 1 AND 512
                  AND (f ->> 'minLength')::numeric = trunc((f ->> 'minLength')::numeric)))
         AND (f -> 'maxLength' IS NULL
              OR (jsonb_typeof(f -> 'maxLength') = 'number'
                  AND (f ->> 'maxLength')::numeric BETWEEN 1 AND 512
                  AND (f ->> 'maxLength')::numeric = trunc((f ->> 'maxLength')::numeric)))
         AND (f -> 'minLength' IS NULL OR f -> 'maxLength' IS NULL
              OR (f ->> 'minLength')::numeric <= (f ->> 'maxLength')::numeric)
         -- flags are flags
         AND (f -> 'required'  IS NULL OR jsonb_typeof(f -> 'required')  = 'boolean')
         AND (f -> 'sensitive' IS NULL OR jsonb_typeof(f -> 'sensitive') = 'boolean')
         AND (f -> 'help'      IS NULL OR jsonb_typeof(f -> 'help')      = 'string')
       , false)
    )

    -- A duplicate key means one of the two field definitions silently wins, and
    -- which one is decided by iteration order.
    AND (SELECT count(DISTINCT f ->> 'key') FROM jsonb_array_elements("fields") AS f)
        = jsonb_array_length("fields");
$$;

-- Swapped in place of the 0001 guard. `NOT VALID` is deliberately NOT used: the
-- table is small, and a constraint that does not check the rows already there is
-- not the guarantee this is being added for. If an existing row fails this, that
-- row is the bug and the migration should stop.
ALTER TABLE "p2p"."payment_method_schemas" DROP CONSTRAINT IF EXISTS "payment_method_schemas_fields_ck";
ALTER TABLE "p2p"."payment_method_schemas" ADD CONSTRAINT "payment_method_schemas_fields_ck"
  CHECK ("p2p"."payment_method_fields_are_well_formed"("fields"));
