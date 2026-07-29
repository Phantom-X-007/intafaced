-- svc-trade · multi-asset instruments: commodities and forex beside crypto (§5.2)
-- Reversal: 0001_multi_asset_instruments.down.sql
--
-- Doctrine §5.2 already says forex is "the same engine, `kind:spot` with fiat
-- pairs". This migration is what makes that true, because `trade.markets` as
-- shipped in 0000 could not describe a non-crypto listing:
--
--   · It had no asset class, so a gold market and a BTC market were the same
--     product to every consumer of this table.
--   · It had no unit, so a quantity on XAU/USD was a bare number with no way to
--     know it meant troy ounces rather than coins.
--   · It had no hours, so every market implicitly traded 24/7. Forex does not,
--     and neither do the CME metals and energies. A market that cannot say it is
--     shut accepts an order it cannot fill and holds the user's funds against it
--     until somebody notices.
--
-- `packages/contracts/src/instruments.ts` is the authority for all three; this
-- table is where they are stored. The seed at the bottom is exactly the
-- `INSTRUMENTS` catalogue from that file — the contract test parses every entry
-- and this file lists the same symbols, so a listing cannot exist on one side
-- only.
--
-- Every statement is idempotent and this file is re-runnable, per 0000.

DO $$ BEGIN
  CREATE TYPE "trade"."asset_class" AS ENUM ('crypto', 'commodity', 'forex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What one unit of the base asset IS. `unit` is anything counted (a coin, a
-- unit of currency); the rest name a physical measure and are not
-- interchangeable — 10 of WTI/USD is ten barrels, 10 of XAU/USD is ten troy
-- ounces, and nothing downstream can recover the difference if this column
-- does not carry it.
DO $$ BEGIN
  CREATE TYPE "trade"."instrument_unit" AS ENUM ('unit', 'troy_ounce', 'barrel', 'mmbtu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Named schedules rather than embedded session tables. The windows themselves
-- live in `instruments.ts` (`TRADING_SCHEDULES`), where they are evaluated
-- against a real IANA timezone so the forex week tracks US daylight saving
-- instead of drifting an hour twice a year. Storing a key keeps the database
-- from holding a second, divergent copy of the calendar.
DO $$ BEGIN
  CREATE TYPE "trade"."trading_schedule" AS ENUM ('crypto-24x7', 'fx-global', 'cme-globex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── new columns on trade.markets ─────────────────────────────────────────────
-- Added with defaults that describe the markets already listed (crypto, spot,
-- continuous, counted units), so an existing row is correct without a backfill
-- and the columns can be NOT NULL from the start.

ALTER TABLE "trade"."markets"
  ADD COLUMN IF NOT EXISTS "asset_class"   "trade"."asset_class"      NOT NULL DEFAULT 'crypto',
  ADD COLUMN IF NOT EXISTS "quote_unit"    "trade"."instrument_unit"  NOT NULL DEFAULT 'unit',
  -- How many `quote_unit`s one quoted price covers. Almost always 1.
  ADD COLUMN IF NOT EXISTS "unit_size"     numeric(38, 18)            NOT NULL DEFAULT 1,
  -- The conventional smallest quoted move: 0.0001 on most FX majors, 0.01 on
  -- JPY crosses and on gold. NULL on crypto, which has no pip convention.
  -- DISTINCT from tick_size, which is what the engine enforces — FX venues quote
  -- fractional pips, so tick is routinely a tenth of this. Conflating the two
  -- displays every spread off by a factor of ten.
  ADD COLUMN IF NOT EXISTS "pip_size"      numeric(38, 18),
  ADD COLUMN IF NOT EXISTS "schedule"      "trade"."trading_schedule" NOT NULL DEFAULT 'crypto-24x7',
  -- Which plane lists this market (§22, §17.5). The DEX/CEX switch reads it:
  -- a market carrying 'protocol' is one svc-protocol can actually match, and
  -- listing one it cannot would advertise a book that does not exist.
  ADD COLUMN IF NOT EXISTS "planes"        text[]                     NOT NULL DEFAULT ARRAY['fiat']::text[],
  ADD COLUMN IF NOT EXISTS "display_name"  text                       NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "markets_asset_class_idx" ON "trade"."markets" ("asset_class");

-- THE HOURS RULE, in the database. Crypto is the only class that trades
-- continuously; a forex or commodity row marked 'crypto-24x7' would accept
-- orders into a closed venue every weekend. Enforced here as well as in the
-- Zod schema because a bad listing inserted by hand would otherwise sit dormant
-- until the first Saturday.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_hours_match_class_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_hours_match_class_ck"
  CHECK (("asset_class" = 'crypto') = ("schedule" = 'crypto-24x7'));

-- Crypto has no pip convention and the other two classes both have one. A
-- missing pip on an FX pair silently becomes "display the tick", which is a
-- tenth of the right number.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_pip_matches_class_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_pip_matches_class_ck"
  CHECK (("asset_class" = 'crypto' AND "pip_size" IS NULL) OR ("asset_class" <> 'crypto' AND "pip_size" > 0));

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_unit_size_positive_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_unit_size_positive_ck"
  CHECK ("unit_size" > 0);

-- A market must be listed on at least one plane, and only on planes that exist.
-- An empty array here is a market nothing can ever show.
ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_planes_valid_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_planes_valid_ck"
  CHECK (array_length("planes", 1) >= 1 AND "planes" <@ ARRAY['fiat', 'protocol']::text[]);

ALTER TABLE "trade"."markets" DROP CONSTRAINT IF EXISTS "markets_display_name_present_ck";
ALTER TABLE "trade"."markets" ADD CONSTRAINT "markets_display_name_present_ck"
  CHECK (length("display_name") > 0);

-- ── seed: the launch catalogue ───────────────────────────────────────────────
-- Mirrors `INSTRUMENTS` in packages/contracts/src/instruments.ts. Adding a
-- market is a row in both, never a code change — the same property
-- `ledger.assets` has.
--
-- `listed_at` is set because `markets_active_listed_ck` (0000) requires an
-- active market to have one: an active market is one somebody can trade, so it
-- must have a listing date.
--
-- ON CONFLICT DO NOTHING on the symbol: re-running must not re-terminate a
-- market an operator has since halted or re-priced. A seed establishes a
-- market; it does not get to overrule an operator afterwards.

INSERT INTO "trade"."markets" (
  "symbol", "base_asset", "quote_asset", "display_name", "asset_class", "kind",
  "quote_unit", "unit_size", "pip_size", "tick_size", "lot_size", "min_qty",
  "min_notional", "schedule", "planes", "status", "maker_bps", "taker_bps", "listed_at"
) VALUES
  -- ── Crypto · continuous, listed on BOTH planes ────────────────────────────
  ('BTC/USDT', 'BTC', 'USDT', 'Bitcoin',         'crypto', 'spot', 'unit', 1, NULL, 0.01,    0.00001, 0.00001, 5,  'crypto-24x7', ARRAY['fiat','protocol']::text[], 'active', 10, 20, now()),
  ('ETH/USDT', 'ETH', 'USDT', 'Ether',           'crypto', 'spot', 'unit', 1, NULL, 0.01,    0.0001,  0.0001,  5,  'crypto-24x7', ARRAY['fiat','protocol']::text[], 'active', 10, 20, now()),
  ('BTC/USDC', 'BTC', 'USDC', 'Bitcoin',         'crypto', 'spot', 'unit', 1, NULL, 0.01,    0.00001, 0.00001, 5,  'crypto-24x7', ARRAY['fiat','protocol']::text[], 'active', 10, 20, now()),
  ('ETH/USDC', 'ETH', 'USDC', 'Ether',           'crypto', 'spot', 'unit', 1, NULL, 0.01,    0.0001,  0.0001,  5,  'crypto-24x7', ARRAY['fiat','protocol']::text[], 'active', 10, 20, now()),
  ('IFC/USDT', 'IFC', 'USDT', 'INTAFACED Coin',  'crypto', 'spot', 'unit', 1, NULL, 0.0001,  0.01,    0.01,    5,  'crypto-24x7', ARRAY['fiat','protocol']::text[], 'active', 10, 20, now()),

  -- ── Commodities · CME Globex hours, Fiat Plane only ───────────────────────
  -- Metals price per troy ounce, the energies per barrel and per MMBtu.
  ('XAU/USD',    'XAU',    'USD', 'Gold',              'commodity', 'spot', 'troy_ounce', 1, 0.01,  0.01,  0.01, 0.01, 10, 'cme-globex', ARRAY['fiat']::text[], 'active', 15, 25, now()),
  ('XAG/USD',    'XAG',    'USD', 'Silver',            'commodity', 'spot', 'troy_ounce', 1, 0.01,  0.001, 0.1,  0.1,  10, 'cme-globex', ARRAY['fiat']::text[], 'active', 15, 25, now()),
  ('WTI/USD',    'WTI',    'USD', 'Crude Oil (WTI)',   'commodity', 'spot', 'barrel',     1, 0.01,  0.01,  1,    1,    10, 'cme-globex', ARRAY['fiat']::text[], 'active', 15, 25, now()),
  ('BRENT/USD',  'BRENT',  'USD', 'Crude Oil (Brent)', 'commodity', 'spot', 'barrel',     1, 0.01,  0.01,  1,    1,    10, 'cme-globex', ARRAY['fiat']::text[], 'active', 15, 25, now()),
  ('NATGAS/USD', 'NATGAS', 'USD', 'Natural Gas',       'commodity', 'spot', 'mmbtu',      1, 0.001, 0.001, 10,   10,   10, 'cme-globex', ARRAY['fiat']::text[], 'active', 15, 25, now()),

  -- ── Forex majors · interbank week, Fiat Plane only ────────────────────────
  -- Tick is a FRACTIONAL pip on every pair — a tenth of pip_size — which is how
  -- the interbank market has quoted for two decades. JPY crosses pip at 0.01
  -- because the yen is quoted to two places; that single difference is the one
  -- every naive FX integration gets wrong. Lot is one micro lot.
  ('EUR/USD', 'EUR', 'USD', 'Euro',                 'forex', 'spot', 'unit', 1, 0.0001, 0.00001, 1000, 1000, 1000, 'fx-global', ARRAY['fiat']::text[], 'active', 5, 10, now()),
  ('GBP/USD', 'GBP', 'USD', 'Pound Sterling',       'forex', 'spot', 'unit', 1, 0.0001, 0.00001, 1000, 1000, 1000, 'fx-global', ARRAY['fiat']::text[], 'active', 5, 10, now()),
  ('USD/JPY', 'USD', 'JPY', 'US Dollar',            'forex', 'spot', 'unit', 1, 0.01,   0.001,   1000, 1000, 1000, 'fx-global', ARRAY['fiat']::text[], 'active', 5, 10, now()),
  ('AUD/USD', 'AUD', 'USD', 'Australian Dollar',    'forex', 'spot', 'unit', 1, 0.0001, 0.00001, 1000, 1000, 1000, 'fx-global', ARRAY['fiat']::text[], 'active', 5, 10, now()),
  ('USD/CHF', 'USD', 'CHF', 'US Dollar',            'forex', 'spot', 'unit', 1, 0.0001, 0.00001, 1000, 1000, 1000, 'fx-global', ARRAY['fiat']::text[], 'active', 5, 10, now()),
  ('USD/CAD', 'USD', 'CAD', 'US Dollar',            'forex', 'spot', 'unit', 1, 0.0001, 0.00001, 1000, 1000, 1000, 'fx-global', ARRAY['fiat']::text[], 'active', 5, 10, now())
ON CONFLICT ("symbol") DO NOTHING;
