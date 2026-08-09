/**
 * THE VENUE MARK PATH, MEASURED IN BALANCES.
 *
 * `mark-from-venue.test.ts` next door asserts what the venue mark source
 * RETURNS. This file asserts what the ledger holds afterwards, because a mark
 * source that returns the wrong number is only a defect once somebody is paid
 * on it — and "the returned quote looked wrong" is not a claim about money.
 *
 * Every test here therefore ends on `ledger.balance(...)`, never on a status
 * code and never on the value `close()` handed back.
 *
 * ── Why this is its own suite rather than a block in position-service.test.ts ─
 *
 * That file is the natural home — it already owns a database, a ledger and a
 * PositionService. It is also being actively rewritten for the `closing`
 * position state on another branch, and two agents appending to the same 1000-
 * line suite is how one of them loses a test. The harness below is the minimum
 * that lets a venue mid move real money: one market, one funded trader, one
 * profit pot. Nothing is mocked between the mark and the balance.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import {
  MemoryLedger,
  formatAmount,
  houseFees,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  userAvailable,
} from '@intafaced/ledger-client';
import { MemoryEventBus } from '@intafaced/events';
import type { VenueBookSnapshot } from '@intafaced/venue-contracts';
import { PositionService } from './position-service.js';
import { markSourceFromDepth } from './mark-from-depth.js';
import { markSourceFromVenuePublicBook, markSourcePrefer } from './mark-from-venue.js';
import type { EngineDepth } from '../spot/matching-client.js';
import { formatAccountRef, profitSourceFromConfig, recipeProfitFundingAccount } from './profit-source.js';

/**
 * A PER-RUN DATABASE, created and dropped by this suite — the same posture as
 * `position-service.test.ts`, and for the same reason: trade's SQL is
 * schema-qualified, so the isolation boundary has to be the DATABASE.
 *
 * The URL is the ADMIN one (`TEST_DATABASE_URL`): creating a database needs
 * CREATEDB, which the per-service roles deliberately lack.
 */
const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
/** Someone else entirely — used only to route seed value into the house pot. */
const BOB = '22222222-2222-4222-8222-222222222222';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('venue mark payouts (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;

  const NOW = new Date('2026-08-06T12:00:00.000Z');
  const MARKET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  /** The pot realised profit is paid from — named, never defaulted. */
  const PROFIT_SOURCE = formatAccountRef(recipeProfitFundingAccount('USDT'));
  const profitPot = () => houseFees('trade', 'USDT');

  /** One wei. The smallest order the ledger's 18-decimal scale can express. */
  const DUST = '0.000000000000000001';

  /**
   * Fund the profit pot the way it actually fills: somebody else's realised
   * loss, drawn from margin they had really locked. Three real recipes, no
   * fixture poking a balance into place — so the ceiling these tests assert
   * against is a balance the ledger agrees exists.
   */
  async function fundProfitSource(amount: string) {
    const seedPosition = `pot-seed-${randomUUID()}`;
    await ledger.post(recipes.deposit({ userId: BOB, assetId: 'USDT', amount: amt(amount), rail: 'test', railRef: `pot-${randomUUID()}` }));
    await ledger.post(recipes.futuresMarginLock({ positionId: seedPosition, userId: BOB, assetId: 'USDT', amount: amt(amount) }));
    await ledger.post(
      recipes.futuresRealizeLoss({
        positionId: seedPosition,
        userId: BOB,
        assetId: 'USDT',
        fromMargin: amt(amount),
        fromInsurance: 0n,
        lossId: seedPosition,
      }),
    );
  }

  /**
   * A venue book snapshot, shaped exactly as `MarketDataAdapter.snapshotBook`
   * returns one: scaled-bigint `[price, quantity]` pairs.
   */
  function venueSnap(bids: [string, string][], asks: [string, string][]): VenueBookSnapshot {
    const level = ([p, q]: [string, string]) => [amt(p), amt(q)] as const;
    return {
      venueId: 'binance-spot',
      symbol: 'BTC/USDT',
      bids: bids.map(level),
      asks: asks.map(level),
      sequence: 1,
      sequenced: true,
      observedAt: NOW,
    };
  }

  /**
   * A PositionService priced off an EXTERNAL VENUE's public book — the
   * production venue mark path (A-TRADE-VENUE-1), wired the way
   * `svc-trade/src/index.ts` wires it.
   *
   * Note what is NOT here: no price reaches `open()` or `close()`. After
   * `docs/adr/2026-08-05-futures-risk-and-mark-law.md` neither method takes
   * one. A test that wants a different exit price moves the VENUE BOOK.
   */
  function onVenue(readBook: () => Promise<VenueBookSnapshot>) {
    return new PositionService(sql, ledger, {
      marks: markSourceFromVenuePublicBook({
        adapter: { snapshotBook: async () => readBook() },
        resolveSymbol: () => 'BTC/USDT',
      }),
      profitSource: profitSourceFromConfig(PROFIT_SOURCE),
      bus,
      now: () => NOW,
    });
  }

  /**
   * Run an operation and report `'paid'` or the refusal code, WITHOUT asserting
   * on it.
   *
   * So that the BALANCE lines are the ones that go red. `expect(...).rejects`
   * throws the moment a defect lets a payout through, and the money assertions
   * after it never run — which would leave this suite proving that an exception
   * is missing rather than that 2,000 USDT is still in the pot. The refusal
   * code is checked too, last, as a detail of the vocabulary.
   */
  async function settle(op: () => Promise<unknown>): Promise<string> {
    try {
      const result = await op();
      // Exit-when-dark: a successful freeze is not a payout — report the reason.
      if (result && typeof result === 'object' && (result as { status?: string }).status === 'closing') {
        return (result as { closingReason?: string | null }).closingReason ?? 'closing';
      }
      return 'paid';
    } catch (err) {
      return (err as { code?: string })?.code ?? String(err);
    }
  }

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    await sql`
      INSERT INTO trade.markets (
        id, symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional,
        maker_bps, taker_bps, status, display_name, listed_at
      ) VALUES (
        ${MARKET}, 'BTC/USDT-PERP', 'BTC', 'USDT', 'futures',
        '0.01', '0.0001', '0.0001', '1', 10, 20, 'active', 'BTC perpetual', now()
      )
    `;
    await ledger.post(
      recipes.deposit({ userId: ALICE, assetId: 'USDT', amount: amt('100000'), rail: 'test', railRef: `fund-${randomUUID()}` }),
    );
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('D-S-07: the venue mid is not size-blind', () => {
    /**
     * THE DEFECT, STATED IN BALANCES.
     *
     * `midFromVenueBook` and `markSourceFromVenuePublicBook`'s `readBook` both
     * read the PRICE at each best level (`snap.bids[0][0]`) and discarded the
     * QUANTITY at index 1, so two 1-wei orders ON AN EXTERNAL VENUE minted a
     * payout-grade `mid`. Measured on this exact scenario with the size-blind
     * read put back: the close SUCCEEDS, Alice's available goes 80,000 →
     * 102,000 and the profit pot goes 10,000 → 8,000. **2,000 USDT paid out
     * against a venue book holding two orders worth about four femto-cents.**
     *
     * WORSE THAN THE MATCHING-BOOK CASE that `c7dfb5e4` fixed, because the book
     * is not ours. That defect needed somebody to get an order onto our own
     * engine; this one needs an illiquid hour on a venue this platform does not
     * run, cannot police, and has no ability to set a minimum order size on.
     *
     * The move is 1000bps — deliberately inside the 2000bps deviation breaker,
     * so this test measures the size fix and nothing else.
     *
     * REVERT PROOF: put `snap.bids[0][0]` / `snap.asks[0][0]` back in
     * `markSourceFromVenuePublicBook`'s `readBook` and the pot line goes red.
     */
    it('refuses to pay on a venue mid minted from two dust orders, and the 2,000 stays in the pot', async () => {
      await fundProfitSource('10000');
      let book = venueSnap([['1999', '10']], [['2001', '10']]);
      const svc = onVenue(async () => book);

      const pos = await svc.open({
        clientOpenId: 't-open-mark-from-venue-payout.test-1',
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long',
        size: amt('10'),
        leverage: amt('1'),
      });
      expect(pos.entryPrice).toBe('2000');
      const userAfterOpen = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;

      // The venue's market makers pull. What is left is one wei a side, 2 apart.
      book = venueSnap([['2199', DUST]], [['2201', DUST]]);
      const outcome = await settle(() => svc.close(ALICE, pos.id!));

      // THE ASSERTIONS THAT DECIDE THIS, and they are balances.
      expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('10000');
      expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(userAfterOpen);
      expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('20000');
      expect(await svc.listOpen(ALICE)).toHaveLength(1);
      expect((await svc.listOpen(ALICE))[0]!.status).toBe('closing');
      // Freeze reason reuses the mark vocabulary — no invent, no second refusal set.
      expect(outcome).toBe('trade.mark_missing');
    });

    /**
     * THE COUNTER-TEST. Same two prices, real size behind them.
     *
     * The refusal is about the venue's DEPTH, not about the prices. Without
     * this, the "fix" could be a rule against profitable closes — an outage
     * wearing a control's clothes — and nothing here would notice.
     */
    it('the same two venue prices with real size behind them do pay out', async () => {
      await fundProfitSource('10000');
      let book = venueSnap([['1999', '10']], [['2001', '10']]);
      const svc = onVenue(async () => book);
      const pos = await svc.open({
        clientOpenId: 't-open-mark-from-venue-payout.test-2',
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long',
        size: amt('10'),
        leverage: amt('1'),
      });

      book = venueSnap([['2199', '10']], [['2201', '10']]);
      const outcome = await settle(() => svc.close(ALICE, pos.id!));

      // 100000 - 20000 margin + 20000 back + 10 * (2200 - 2000) = 102000
      expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('102000');
      expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('8000');
      expect(outcome).toBe('paid');
      expect(await svc.listOpen(ALICE)).toEqual([]);
    });

    /**
     * A dust venue book cannot even OPEN a position — no entry price is minted
     * from dust, and no margin is locked against one.
     */
    it('refuses to OPEN on a dust venue book, and locks nothing', async () => {
      const svc = onVenue(async () => venueSnap([['1999', DUST]], [['2001', DUST]]));
      const before = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;

      const outcome = await settle(() =>
        svc.open({
          clientOpenId: 't-open-mark-from-venue-payout.test-3',
          userId: ALICE,
          symbol: 'BTC/USDT-PERP',
          side: 'long',
          size: amt('10'),
          leverage: amt('1'),
        }),
      );

      expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(before);
      expect(await svc.listOpen(ALICE)).toEqual([]);
      expect(outcome).toBe('trade.mark_missing');
    });

    /**
     * THE PREFERENCE CHAIN, WHICH IS HOW PRODUCTION ACTUALLY READS A MARK.
     *
     * `futures-jobs.ts` builds `markSourcePrefer(venue, depth)`. A venue
     * refusal is therefore not an outage — it falls through to our own matching
     * book, which runs the SAME gate on its own levels. That is the argument
     * that refusing here costs nothing legitimate, so it is asserted rather
     * than left in prose.
     *
     * It also shows the defect's second face. Size-blind, the venue's two dust
     * orders at 9999/10001 WIN the preference — a mark of 10000 against an
     * honest book at 2200 — and the close is then refused by the deviation
     * breaker instead of paying at the right price. The trader is locked out of
     * a legitimate exit by a number nobody rested capital behind.
     */
    it('a refused venue mid falls through to the matching book, which pays honestly', async () => {
      await fundProfitSource('10000');
      let depth: EngineDepth = { bids: [['1999', '10']], asks: [['2001', '10']], sequence: 1 };
      let venue = venueSnap([['1999', '10']], [['2001', '10']]);
      const svc = new PositionService(sql, ledger, {
        marks: markSourcePrefer(
          markSourceFromVenuePublicBook({
            adapter: { snapshotBook: async () => venue },
            resolveSymbol: () => 'BTC/USDT',
          }),
          markSourceFromDepth(async () => depth),
        ),
        profitSource: profitSourceFromConfig(PROFIT_SOURCE),
        bus,
        now: () => NOW,
      });

      const pos = await svc.open({
        clientOpenId: 't-open-mark-from-venue-payout.test-4',
        userId: ALICE,
        symbol: 'BTC/USDT-PERP',
        side: 'long',
        size: amt('10'),
        leverage: amt('1'),
      });
      expect(pos.entryPrice).toBe('2000');

      // The venue goes to dust at a wild price; our own book is fine, and 10% up.
      venue = venueSnap([['9999', DUST]], [['10001', DUST]]);
      depth = { bids: [['2199', '10']], asks: [['2201', '10']], sequence: 2 };
      const outcome = await settle(() => svc.close(ALICE, pos.id!));

      // Priced at the matching book's 2200, NOT the venue's 10000.
      expect(formatAmount((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount)).toBe('102000');
      expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('8000');
      expect(outcome).toBe('paid');
    });
  });
}
