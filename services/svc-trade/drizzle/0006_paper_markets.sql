-- Paper-trading market flag (TRK academy.paper-trading Stage-1).
-- Paper markets never post real ledger holds on placeOrder.
-- Reversal: 0006_paper_markets.down.sql

ALTER TABLE "trade"."markets"
  ADD COLUMN IF NOT EXISTS "paper" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "trade"."markets"."paper" IS
  'true = paper/simulated market; placeOrder must never post orderHold or tradeFill to the real ledger';
