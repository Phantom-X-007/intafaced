-- Paper-trading market flag (TRK academy.paper-trading Stage-1).
-- Paper markets never post real ledger holds on placeOrder.
-- Reversal: 0006_paper_markets.down.sql

ALTER TABLE "trade"."markets"
  ADD COLUMN IF NOT EXISTS "paper" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "trade"."markets"."paper" IS
  'true = paper/simulated market; placeOrder must never post orderHold or tradeFill to the real ledger';

-- Paper orders post zero hold and never ledger-post. Live orders still use
-- hold_amount > 0 in the service path; the DB allows zero so paper isolation
-- rows are representable without inventing a second funded path.
ALTER TABLE "trade"."orders" DROP CONSTRAINT IF EXISTS "orders_hold_positive_ck";
ALTER TABLE "trade"."orders" ADD CONSTRAINT "orders_hold_non_negative_ck"
  CHECK ("hold_amount" >= 0);

COMMENT ON CONSTRAINT "orders_hold_non_negative_ck" ON "trade"."orders" IS
  'hold_amount >= 0; zero is paper/sim only (no ledger post). Live placeOrder still posts hold_amount > 0.';
