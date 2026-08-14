-- trade.algo · VWAP/POV kinds (real non-seeded taker volume; no invented curve)
-- Reversal: 0027_algo_vwap_pov.down.sql
--
-- ADD VALUE must commit before the labels are used in CHECKs (see 0008).

ALTER TYPE "trade"."algo_kind" ADD VALUE IF NOT EXISTS 'vwap';
ALTER TYPE "trade"."algo_kind" ADD VALUE IF NOT EXISTS 'pov';
