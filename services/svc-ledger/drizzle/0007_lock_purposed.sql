-- intafaced:destructive — replaces accounts_hold_purposed_ck with a STRICTLY
-- STRONGER constraint in the same file. The drop is not a loosening: every row
-- the old check accepted and the new one refuses is a lock pot with no claim,
-- which STEP 1 has already refused to migrate past. Declared because dropping a
-- CHECK destroys an invariant silently, and every row written afterwards is
-- written without it — see tooling/ci/migration-check.mjs.
-- svc-ledger · every lock names its claim, not just `hold` (§8.1, P0-3)
-- Reversal: 0007_lock_purposed.down.sql
--
-- THE DEFECT
--
-- `ledger-client` requires a purpose on all four lock kinds — `hold`, `escrow`,
-- `stake`, `collateral` — through `assertPurposedLocks`, which every post runs.
-- The database backed exactly one of them. `accounts_hold_purposed_ck` (0001)
-- covers `hold` and nothing else.
--
-- 0001 said so at the time, and it was true then:
--
--   "Only `hold` requires a purpose. `escrow`, `stake` and `collateral` are
--    keyed by their own business object elsewhere"
--
-- The client moved past that and no migration followed. So the rule and its
-- backstop have disagreed ever since, on the three kinds where the consequence
-- is worst. `accounts.ts` states it plainly for `collateral`:
--
--   "Releasing loan A's collateral could hand back value that was securing loan
--    B: both postings balance, the journal reconciles, and loan B is quietly
--    unsecured."
--
-- WHY THE DATABASE AND NOT JUST THE CLIENT
--
-- The README's own argument, made for `owner_id` and applying here verbatim: "an
-- adapter bridging a Java stack is the least likely caller in the OS to route
-- through a TypeScript library, so application-only enforcement would be
-- bypassable by exactly the thing it exists to stop."
--
-- WHY IT IS PHRASED AS "NOT available" RATHER THAN LISTING THE LOCK KINDS
--
-- The two ways this constraint can go stale have opposite blast radii. Name the
-- lock kinds explicitly and a lock kind added later escapes the constraint
-- silently — it fails OPEN, which is the commingled-pot bug back again. Phrase
-- it as "anything that is not spendable", and a spendable kind added later is
-- forced to carry a purpose — it fails CLOSED, which is noisy and harmless.
-- On a money path, take the noisy one.
--
-- `available` is fungible with itself, so giving it a purpose would fragment it
-- for nothing. That part of 0001 has not changed.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 · REFUSE — a lock already holding value under no claim.
--
-- There is no honest automatic repair. Inventing a purpose would assign somebody
-- else's reservation to a claim we made up, and that is a value movement wearing
-- a migration's clothes (§0.6). Emptying the pot would destroy it. Both are
-- decisions for a human with the business context, so this fails at migrate time
-- on the populated database where the problem is, naming what it found —
-- rather than succeeding on an empty one and stopping a deploy halfway.
-- Precedent: 0005 STEP 3, and 0006 STEP 1.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(DISTINCT format('%s:%s/%s (%s)', owner_type, owner_id, asset_id, kind), ', ')
    INTO offenders
    FROM "ledger"."accounts"
   WHERE "kind" <> 'available'
     AND length("purpose") = 0;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot apply 0007: lock account(s) hold value under no claim: %. '
      'A purpose names whose reservation this is; without one, releasing a claim can hand back value that was '
      'securing a different claim. Settle the pot through ledger-client and re-open it with a purpose, or, if the '
      'purpose is known, move the value with a ledger post — never an UPDATE in a migration (Doctrine 0.6).', offenders;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 · The constraint, widened to what the client has been enforcing.
--
-- The old name goes: a constraint called `hold_purposed` that covers four kinds
-- would be a lie in the one place nobody re-reads.
ALTER TABLE "ledger"."accounts" DROP CONSTRAINT IF EXISTS "accounts_hold_purposed_ck";
ALTER TABLE "ledger"."accounts" DROP CONSTRAINT IF EXISTS "accounts_lock_purposed_ck";
ALTER TABLE "ledger"."accounts"
  ADD CONSTRAINT "accounts_lock_purposed_ck"
  CHECK ("kind" = 'available' OR length("purpose") > 0);
