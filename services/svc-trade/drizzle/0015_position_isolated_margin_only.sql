-- Isolated margin only, enforced by the database and not only by the service.
--
-- DIRECTION §1 and docs/adr/2026-08-05-futures-risk-and-mark-law.md done-bar
-- item 8 both say: isolated margin only, NO cross-margin path exists, even
-- disabled. Until this migration the storage layer disagreed.
--
-- `position-service.ts` refuses marginMode !== 'isolated' at open(), which
-- covers the one path that goes through open(). It does not cover a direct
-- INSERT, a future code path, a repair script, or any caller that builds a row
-- itself — and the column's DEFAULT 'isolated' silently accepts an explicit
-- 'cross' rather than rejecting it. A rule enforced in one caller is not a
-- storage invariant.
--
-- Why a CHECK and not dropping 'cross' from trade.margin_mode: removing a
-- value from a Postgres enum requires recreating the type and re-pointing every
-- dependent column, which cannot be reversed cleanly, and `migration-check`
-- (one of the 27 doctrine gates) requires every migration to have a reversal.
-- The enum value therefore survives as unreachable data, and this constraint is
-- what makes it unreachable. If cross margin is ever specced it will need its
-- own migration, its own ADR, and an owner ruling — which is the intent.
--
-- The unique index from 0003 still includes margin_mode:
--   uq_positions_open_user_market_side_margin ON (user_id, market_id, side, margin_mode)
-- With one legal value that column contributes nothing to the index. Left
-- alone deliberately: it is harmless, and rebuilding a uniqueness constraint
-- that guards open positions is a bigger risk than the tidiness is worth.

-- Fail loudly rather than silently skipping rows that already violate the law.
-- A migration that cannot hold on real data must say so here, at deploy time,
-- not leave a constraint half-applied.
DO $$
DECLARE
  offending bigint;
BEGIN
  SELECT count(*) INTO offending
  FROM "trade"."positions"
  WHERE "margin_mode" <> 'isolated';

  IF offending > 0 THEN
    RAISE EXCEPTION
      'Refusing to apply: % position row(s) have margin_mode <> ''isolated''. '
      'DIRECTION §1 permits isolated margin only. These rows predate the '
      'constraint and are an owner decision (DIRECTION §3 — they represent real '
      'positions with real collateral); decide what happens to them before '
      'this migration can hold.', offending;
  END IF;
END $$;

ALTER TABLE "trade"."positions"
  ADD CONSTRAINT "ck_positions_isolated_margin_only"
  CHECK ("margin_mode" = 'isolated');
