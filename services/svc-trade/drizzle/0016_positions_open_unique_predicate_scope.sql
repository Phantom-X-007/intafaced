-- trade.futures · `positions_open_unique_idx` covers `open` ONLY, on purpose.
-- Reversal: 0016_positions_open_unique_predicate_scope.down.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FINDING
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `0003_trade_futures_positions.sql:50` created:
--
--     CREATE UNIQUE INDEX positions_open_unique_idx
--       ON trade.positions (user_id, market_id, side, margin_mode)
--       WHERE status = 'open';
--
-- with the comment "One open position per (user, market, side, margin_mode)".
-- At the time `position_status` had three values and that sentence was the
-- whole truth. `0008` / `0009` then added a FOURTH — `closing`, the dark-feed
-- freeze from `docs/adr/2026-08-07-futures-exit-when-the-feed-is-dark.md` — and
-- left the predicate alone. Nobody re-read the sentence against the new value.
--
-- Reproduced end to end in `src/futures/closing-position-uniqueness.test.ts`:
-- a trader opens a long, the feed goes dark, she closes, the row freezes to
-- `closing`, the feed returns, and she opens a SECOND long on the same market
-- and side. `listOpen` returns two rows, `['closing', 'open']`.
--
-- `0015` reviewed this exact index and wrote a paragraph about it, but only
-- about the `margin_mode` COLUMN — concluding correctly that the column is
-- harmless. The predicate was never looked at. That is the reason this
-- migration exists at all and the reason it is a comment: the next reviewer
-- must find the decision at the index, not four files away.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DECISION: THE PREDICATE STAYS AS IT IS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The invariant was always narrower than the index's name suggests. It is
--
--     one position in status `open` per (user_id, market_id, side, margin_mode)
--
-- and NOT "one live position". Saying so explicitly, in the schema, is the fix.
--
-- The tempting alternative is `WHERE status IN ('open', 'closing')`. Rejected:
--
-- **1 — it rebuilds the trap ADR 2026-08-07 was written to remove.** A `closing`
-- row exists for exactly one reason: OUR feed went dark while a trader was
-- trying to leave. That ADR ruled that *the platform's outage is not the
-- trader's risk*, and that *a control which traps funds is not a safety
-- control*. A tightened predicate charges our outage to the trader twice —
-- first by freezing their exit, then by locking them out of that market and
-- side. There is no settlement tick: a `closing` row settles only when someone
-- calls `close()` again AND a usable mark exists, so the lockout's duration is
-- set by our feed, not by the trader. This is not a new policy question; the
-- owner already ruled the principle on 2026-08-07 and this applies it.
--
-- **2 — the hazards it would guard against do not exist here.** Checked in the
-- code, not assumed, and each has a test in the file named above:
--
--   · Double-counted margin — isolated margin only (`0015`). Every position
--     holds its own ledger pot `position:<id>`, funded out of the same finite
--     `userAvailable`. The second open must post fresh margin. Row count is not
--     what bounds a trader's exposure; their balance is, and this carve-out
--     does not move it.
--   · Confused liquidation — `sqlLiquidationPositionLoader` filters
--     `status = 'open'` (`src/futures/position-loaders.ts`), so a frozen row is
--     never scanned. The live row is judged against its own margin, alone.
--   · Confused funding — the funding loader filters `status = 'open'` too, so
--     the frozen row accrues nothing. ADR done-bar item 4.
--
-- Nothing in svc-trade resolves a position by `(user, market, side)`. Every
-- read, row lock, ledger recipe and idempotency key is by position id, so two
-- rows on one market and side are two independent settlements, never one
-- ambiguous one.
--
-- **3 — a tightened predicate cannot be written without a second trap.** Under
-- `IN ('open','closing')`, a trader holding one frozen long who tries to close
-- a second long while the feed is STILL dark would have the freeze UPDATE
-- collide with the index — a 409 on an exit request, which is the original
-- defect wearing the fix's clothes.
--
-- **THE TRADE-OFF ACCEPTED, STATED PLAINLY.** During a long outage a trader can
-- cycle close→open→close→open and accumulate several frozen rows on one market
-- and side. That is real, and it is what this decision costs. It is bounded by
-- their own free balance — each open posts fresh margin — and each frozen row
-- settles independently against a profit pot whose bound is re-read live inside
-- every close, so N small settlements drain it exactly as one large one would.
-- The competing price was trapping a trader in a market because of our own
-- outage. This repo has already decided which of those two it pays.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A COMMENT AND NOT A RENAME
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `positions_open_unique_idx` is literally accurate — it is the unique index on
-- `open` positions. What misled the last reviewer was not the name but the
-- absence of a recorded decision. A rename would also silently break
-- `0003_trade_futures_positions.down.sql`, which drops this index BY NAME, and
-- `0015` already argued that touching a uniqueness guard on open positions is a
-- bigger risk than tidiness is worth. That argument still holds.
--
-- This migration changes no data, no column, no constraint and no index
-- definition. It cannot fail on real data, which is deliberate: the point is to
-- make the predicate a decision with a reason attached, not to move it.

-- Report, at deploy time and on the real database, what a tightened predicate
-- WOULD have found. A NOTICE and never an EXCEPTION: this migration is not
-- allowed to fail a deploy, and the number is for whoever revisits the decision
-- rather than for this migration to act on. Verified locally as 0 before this
-- was written, on the only reachable database holding trade.positions rows.
DO $$
DECLARE
  live_dupes bigint;
BEGIN
  SELECT count(*) INTO live_dupes
  FROM (
    SELECT 1
    FROM "trade"."positions"
    WHERE "status" IN ('open', 'closing')
    GROUP BY "user_id", "market_id", "side", "margin_mode"
    HAVING count(*) > 1
  ) g;

  IF live_dupes > 0 THEN
    RAISE NOTICE
      'positions_open_unique_idx scope: % (user, market, side, margin_mode) group(s) '
      'currently hold more than one row in status open/closing. This is LEGAL — see '
      'the header of 0016 and docs/adr/2026-08-07-futures-exit-when-the-feed-is-dark.md. '
      'It is reported because anyone proposing to tighten the predicate needs this '
      'number first.', live_dupes;
  ELSE
    RAISE NOTICE 'positions_open_unique_idx scope: no (user, market, side, margin_mode) group holds more than one open/closing row.';
  END IF;
END $$;

COMMENT ON INDEX "trade"."positions_open_unique_idx" IS
  'One position in status ''open'' per (user_id, market_id, side, margin_mode). '
  'The predicate deliberately EXCLUDES ''closing'': a frozen exit exists only because '
  'our mark feed went dark, and ADR 2026-08-07 (futures exit when the feed is dark) '
  'rules that the platform''s outage is not the trader''s risk — so a trader may open a '
  'fresh position on a market while an older one drains. Safe because margin is '
  'isolated per position, and the liquidation and funding loaders both filter '
  'status = ''open''. Do not widen this predicate without re-reading that ADR and '
  'migration 0016; src/futures/closing-position-uniqueness.test.ts pins it.';
