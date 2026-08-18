-- trade.futures · freeze funding period membership on first plan
-- Reversal: 0019_funding_period_membership.down.sql
--
-- THE DEFECT
--
-- `runFundingTick` plans legs from positions open *now*, then posts, then
-- writes the settle marker last. A crash in the post→settle gap replays the
-- whole plan. Ledger keys are (period, payer, payee) so a *closed* short that
-- drops out of the book is safe (surviving pairs keep their keys). A position
-- *opened* between the failed attempt and the replay is a genuinely new pair
-- with a new key — the ledger takes an extra leg while `applyFundingNets`
-- (idempotent on (position, period)) records only the first net for the
-- original payer. Ledger vs margin_current diverge; the original payer pays.
--
-- THE FIX
--
-- Membership for a period is frozen on the first successful plan for that
-- periodId: the set of open position ids at that instant. Later ticks (and
-- crash replays) use that set intersected with currently-open rows — they
-- never admit a position that opened after the freeze. First INSERT wins;
-- no owner number, no invented rate, no period-boundary product law.
--
-- Settled periods keep their membership row for audit; it is not the settle
-- marker (that remains `funding_periods`).

CREATE TABLE IF NOT EXISTS "trade"."funding_period_membership" (
  "period_id"            text PRIMARY KEY,
  "market_id"            text NOT NULL,
  "member_position_ids"  text[] NOT NULL,
  "frozen_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "funding_period_membership_market_idx"
  ON "trade"."funding_period_membership" ("market_id");
