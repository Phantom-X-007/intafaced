-- intafaced:destructive drops the index buyback_runs_window_idx, superseded in this
-- same migration by the EXCLUDE constraint buyback_runs_window_no_overlap_ex. Keeping
-- both would leave which SQLSTATE a duplicate raises up to index ordering; the
-- guarantee is strictly strengthened, never weakened.
-- ── Buyback: claim the window BEFORE the burn, and make overlap impossible ───
--
-- Two defects, both of which moved real value. Neither fix decides an economic
-- number: not a window length, not a cadence, not a rate. See
-- docs/adr/2026-08-04-token-economics-outcomes.md ("The defect to fix
-- regardless of any number").
--
-- 1. ORDERING. `recordBuyback` posted the burn FIRST and only then inserted the
--    run row `ON CONFLICT (id) DO NOTHING`. But the guarding index was on the
--    WINDOW, not on `id` — so a NEW run id over an already-spent window burned
--    for real and then failed on an index its ON CONFLICT clause did not name.
--    Measured, on this schema: the burn account went 600 -> 1200, zero rows
--    were written for the second run, no event was published, and the caller
--    got an opaque 500 (the raw 23505 is neither a TokenError nor a
--    LedgerError). The old comment above the index — "A revenue window is spent
--    exactly once" — was true of the ROW and never of the BURN.
--
--    `status` is what makes claim-before-post expressible: a run owns its
--    window from the instant it is claimed (`pending`), and becomes `settled`
--    only once its burn is on the ledger. This is the same claim -> post ->
--    activate shape `token.stakes` already uses (0001), for the same reason:
--    a claim without funding must never be able to create an obligation, and
--    an irreversible leg must never post before the thing that guards it.
--
-- 2. OVERLAP. The unique index matched only exact equality of BOTH timestamps.
--    Measured on this schema: [Jul 1, Aug 1) and the nested [Jul 10, Jul 20) —
--    the same revenue, counted twice — both inserted and both burned, with no
--    error raised at all. "No two runs may cover the same instant" is not
--    expressible as a unique index over two columns; it is exactly what an
--    exclusion constraint over a range says.
--
--    Windows are half-open `[from, to)`: `to` belongs to the next window. That
--    is the only reading under which a contiguous series can be settled at all
--    — under closed `[from, to]`, [Jul, Aug] and [Aug, Sep] would collide on
--    the single shared instant and a gapless revenue series would be
--    unsettleable. It fixes the BOUNDARY rule only. How long a window is, how
--    often one runs, and whether the series must be gapless remain the owner's
--    (ADR: "the numbers that are the owner's").

-- Pre-flight. An exclusion constraint cannot be added over data that already
-- violates it, and Postgres does not accept NOT VALID for one. If historical
-- rows already overlap, they were produced by the bug above — reconciling them
-- means deciding which burn was legitimate, which is a money question this
-- migration must not answer silently. Fail loudly and name the rows instead.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('%s [%s, %s)', a.id, a.revenue_window_from, a.revenue_window_to), ', ')
    INTO offenders
    FROM "token"."buyback_runs" a
    JOIN "token"."buyback_runs" b
      ON a.id <> b.id
     AND tstzrange(a."revenue_window_from", a."revenue_window_to", '[)')
      && tstzrange(b."revenue_window_from", b."revenue_window_to", '[)');

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'token.buyback_runs already contains overlapping revenue windows: %. These were written by the pre-claim ordering bug. Deciding which run legitimately spent the overlap is an owner decision — reconcile them before applying this migration.',
      offenders;
  END IF;
END $$;

-- Lifecycle. Existing rows all burned before their row was written, so they are
-- settled by definition; the default backfills them correctly. New rows are
-- inserted explicitly as 'pending' by the claim.
--
-- text + CHECK rather than an enum on purpose: 0001 records that a Postgres
-- enum value cannot be removed safely, which makes an enum column irreversible.
-- This migration has to be reversible (§14 DoD).
ALTER TABLE "token"."buyback_runs"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'settled';

ALTER TABLE "token"."buyback_runs" DROP CONSTRAINT IF EXISTS "buyback_runs_status_ck";
ALTER TABLE "token"."buyback_runs" ADD CONSTRAINT "buyback_runs_status_ck"
  CHECK ("status" IN ('pending', 'settled'));

-- The guard the old unique index was reaching for. `&&` on a half-open
-- tstzrange refuses identical, nested, partial and one-second-apart overlaps
-- alike. tstzrange has a built-in GiST opclass, so no extension is required.
-- Violations raise SQLSTATE 23P01 (exclusion_violation), not 23505.
ALTER TABLE "token"."buyback_runs" DROP CONSTRAINT IF EXISTS "buyback_runs_window_no_overlap_ex";
ALTER TABLE "token"."buyback_runs" ADD CONSTRAINT "buyback_runs_window_no_overlap_ex"
  EXCLUDE USING gist ((tstzrange("revenue_window_from", "revenue_window_to", '[)')) WITH &&);

-- Now redundant, and worse than redundant: exact equality is a special case of
-- overlap (the `to > from` check already forbids empty ranges, and two
-- identical non-empty ranges always overlap), so keeping both would leave which
-- SQLSTATE a duplicate raises up to index ordering. One invariant, one guard,
-- one error code. The guarantee is strictly strengthened, never weakened.
DROP INDEX IF EXISTS "token"."buyback_runs_window_idx";

-- A settled run is the audit trail; a pending one is a claim in flight and is
-- what a crash-recovery sweep would look for.
CREATE INDEX IF NOT EXISTS "buyback_runs_status_idx" ON "token"."buyback_runs" ("status");
