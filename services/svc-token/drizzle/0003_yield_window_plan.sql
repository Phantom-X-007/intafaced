-- ── Yield: freeze a window's recipient list before any of it is paid ────────
--
-- `distributeRevenue` documents itself as resumable: "each payout is its OWN
-- ledger transaction keyed on (window, user), so a crash halfway through is
-- resumable — re-running pays only whoever was missed."
--
-- That sentence is true only while the staker set does not move, and the staker
-- set moves continuously. The recipient list was recomputed from
-- `token.stakes WHERE status = 'active'` on EVERY call, so a re-run after a new
-- stake opened produced a different, larger list. The keys of the users already
-- paid were spent, so their posts became no-ops — and the newcomer's key was
-- fresh, so the newcomer was paid IN FULL out of a window whose revenue had
-- already been distributed down to the last attounit.
--
-- Measured on this schema: window `w`, 100 IFC swept, one staker A → A is paid
-- 100 and the rewards engine returns to 0. B then stakes. Re-running `w` — the
-- documented-safe operation — computes 50/50, no-ops A's post, and pays B 50
-- that the window never swept. `rewardsEngine` is a `house` account and §4.2
-- makes every non-treasury account hard non-negative, so the 50 comes out of
-- some OTHER window's undistributed revenue, or the run dies mid-loop with a
-- raw insufficient-funds and leaves the window half-paid.
--
-- The plan is therefore written down, once, and read thereafter. This is the
-- same shape `token.buyback_runs.status` (0002) and `token.stakes.status`
-- (0001) already use — claim first, then post the irreversible leg — applied to
-- the thing that was never claimed: WHO the window pays.
--
-- It decides no economic number. Not a window length, not a cadence, not a
-- rate, not who is eligible. It records the answer the existing pro-rata maths
-- already gives, at the moment it is first asked, so that asking twice cannot
-- give two answers.

CREATE TABLE IF NOT EXISTS "token"."yield_payouts" (
  -- The operator's window identifier, same string `rewardPay` keys on.
  "window_id"    text NOT NULL,
  "user_id"      uuid NOT NULL,
  -- The share this user is owed for this window. Written once, at plan time,
  -- and never updated — it is a decision, not a running total. The money itself
  -- lives in the ledger (Doctrine §0.6); this column is the instruction.
  "amount"       numeric(38, 18) NOT NULL,
  -- Null until the ledger post for this row has returned. The pair below makes
  -- "paid" and "has a transaction to point at" the same fact.
  "ledger_tx_id" text,
  "paid_at"      timestamptz,
  "planned_at"   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("window_id", "user_id")
);

-- One row per (window, user) — the same pair `rewardPay`'s idempotency key
-- already assumed, now expressed where a second row can be refused rather than
-- discovered. The PRIMARY KEY above is that guard.

-- A planned payout of nothing is not a payout: the ledger rejects zero-amount
-- entries by design, so a zero row could only ever be a row nothing will clear.
ALTER TABLE "token"."yield_payouts" DROP CONSTRAINT IF EXISTS "yield_payouts_amount_positive_ck";
ALTER TABLE "token"."yield_payouts" ADD CONSTRAINT "yield_payouts_amount_positive_ck"
  CHECK ("amount" > 0);

-- "Paid" with nothing in the book to point at is a phantom payout, and a
-- transaction id with no paid time is a payment nobody recorded finishing.
-- Neither half is meaningful alone.
ALTER TABLE "token"."yield_payouts" DROP CONSTRAINT IF EXISTS "yield_payouts_paid_has_tx_ck";
ALTER TABLE "token"."yield_payouts" ADD CONSTRAINT "yield_payouts_paid_has_tx_ck"
  CHECK (("paid_at" IS NULL) = ("ledger_tx_id" IS NULL));

-- The resume query: "what does this window still owe".
CREATE INDEX IF NOT EXISTS "yield_payouts_unpaid_idx"
  ON "token"."yield_payouts" ("window_id")
  WHERE "paid_at" IS NULL;
