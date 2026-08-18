-- ── Yield: claim (window_id, total) BEFORE sweep — including the empty pool ──
--
-- #1076 froze WHO a window pays (`token.yield_payouts`). It deliberately left
-- the empty-pool case unclaimed: "no plan row is written, so a later run once
-- somebody IS staked plans the window then." That re-opened a class of the same
-- bug under a different shape.
--
-- Measured residual (W4 pick-up / L13 Engine A1):
--   1. Operator distributes window `w` with nobody staked → fees sweep into the
--      rewards engine, zero payout rows.
--   2. A user stakes.
--   3. Operator re-runs `w` (same window id, same total) — the documented-safe
--      resume — and the NEW staker is planned and paid out of revenue that was
--      already "settled" as an empty window.
--
-- The payout freeze only freezes when at least one row is written. An empty
-- settlement left no header, so the second call looked like a first call.
--
-- Fix: a window HEADER (`token.yield_windows`) claims `(window_id, total)` once,
-- before any sweep and before any payout plan is written. An empty settlement
-- is still a settlement — the header exists with zero payout rows. A re-run
-- that names a different total is refused (`token.yield_window_mismatch`). A
-- late staker earns from the NEXT window id, like everybody else who joined
-- after a window closed.
--
-- Order becomes: claim header (+ plan who, if anyone) → sweep → pay. Claim
-- before the irreversible fee movement is the same shape `stake` (0001) and
-- `recordBuyback` (0002) already use.
--
-- Decides no economic number — not a window length, not a cadence, not a rate.
-- It records the total the operator already typed, so asking twice cannot give
-- two answers, including the empty-pool answer.

CREATE TABLE IF NOT EXISTS "token"."yield_windows" (
  -- The operator's window identifier — same string `rewardPay` / `sweepFees`
  -- keys on, and the same string that is the first half of `yield_payouts` PK.
  "window_id"     text PRIMARY KEY,
  -- Revenue total claimed for this window. Written once at claim time; a
  -- re-run that names a different figure is refused rather than guessed at.
  "total_amount"  numeric(38, 18) NOT NULL,
  "claimed_at"    timestamptz NOT NULL DEFAULT now()
);

-- A window of nothing is not a window: the service already refuses
-- `nothing_to_distribute` before claiming. A zero header would be an
-- instruction nothing could settle and a free key for a later real total.
ALTER TABLE "token"."yield_windows" DROP CONSTRAINT IF EXISTS "yield_windows_total_positive_ck";
ALTER TABLE "token"."yield_windows" ADD CONSTRAINT "yield_windows_total_positive_ck"
  CHECK ("total_amount" > 0);
