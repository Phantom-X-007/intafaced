-- svc-mining-pool · windows + shares (Q-mine JobHost+PG mint/rewardPay)
-- Schema `mining_pool` is created by postgres-init, not this file.

CREATE TABLE IF NOT EXISTS "mining_pool"."windows" (
  "window_id"  text PRIMARY KEY,
  "epoch"      integer,
  "asset_id"   text NOT NULL,
  "reward"     numeric(38, 18) NOT NULL,
  "fee_bps"    integer NOT NULL,
  "status"     text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "windows_reward_positive_ck" CHECK ("reward" > 0),
  CONSTRAINT "windows_fee_bps_ck" CHECK ("fee_bps" >= 0 AND "fee_bps" < 10000),
  CONSTRAINT "windows_status_ck" CHECK ("status" IN ('open', 'paid')),
  CONSTRAINT "windows_epoch_nonneg_ck" CHECK ("epoch" IS NULL OR "epoch" >= 0)
);

-- One mintEmission key per (asset, epoch). A second open window would no-op the mint.
CREATE UNIQUE INDEX IF NOT EXISTS "windows_epoch_asset_uidx"
  ON "mining_pool"."windows" ("epoch", "asset_id")
  WHERE "epoch" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "mining_pool"."shares" (
  "share_id"   text PRIMARY KEY,
  "window_id"  text NOT NULL REFERENCES "mining_pool"."windows" ("window_id"),
  "miner_id"   text NOT NULL,
  "weight"     numeric(38, 0) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "shares_weight_positive_ck" CHECK ("weight" > 0)
);

CREATE INDEX IF NOT EXISTS "shares_window_idx"
  ON "mining_pool"."shares" ("window_id");
