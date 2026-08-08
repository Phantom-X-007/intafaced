/**
 * THE FUTURES ORDER PATH — REFUSED WHEN OFF, REAL WHEN ON, AND STILL NOT A
 * SELF-DEALING MACHINE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `assertTradable` refused every non-spot market on the order path, so a futures
 * book could not be filled by anyone and was always empty.
 * `futures/mark-from-depth.ts` named that in its own header and was blunt about
 * what it was: **"a different file's accident, not a control"**, and it named the
 * change that would cash the accident in — "the change that makes futures markets
 * orderable turns this into self-dealing with two dust orders, no capital at risk,
 * and no further code needed."
 *
 * This is that change. So the burden is not "does a futures order work" — it is
 * proving that the thing the old refusal was accidentally protecting is now
 * protected on purpose. That is the third describe block below, and it is the
 * reason this file is not three assertions in `trade-service.test.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE BOOK IS DERIVED FROM `trade.orders` AND NOT SET BY HAND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `StubMatching.depth()` returns whatever a test assigns to `.bids` / `.asks`,
 * and every existing mark test uses that or an inline `async () => book`. Those
 * are the right tool for testing the mark ARITHMETIC, and they were the tool used
 * when the size-blind mid was found and fixed.
 *
 * They are the wrong tool here, because a hand-set book proves nothing about
 * reachability: it would pass identically on `main`, where no order can reach a
 * futures book at all. `bookFromOrders` reads `trade.orders` — the rows the real
 * `placeOrder` wrote after the real `assertTradable`, `assertQty`, `assertPrice`,
 * `assertNotional` and the real ledger hold — and turns them into depth. So the
 * dust in the third block got there the way an attacker would have to put it
 * there, and a market floor that refused it would show up as a red test rather
 * than as a quietly passing one.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import {
  MemoryLedger,
  formatAmount,
  houseFees,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  userAvailable,
} from '@intafaced/ledger-client';
import { TradeService, type ListMarketInput } from '../spot/trade-service.js';
import { StubMatching, StubPerks, principalFor } from '../spot/testing.js';
import { TradeError, type Market } from '../spot/types.js';
import { PositionService } from './position-service.js';
import { bestFromDepth, markSourceFromDepth } from './mark-from-depth.js';
import { formatAccountRef, profitSourceFromConfig, recipeProfitFundingAccount } from './profit-source.js';
import type { EngineDepth } from '../spot/matching-client.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('futures orderable path (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });
  const sql = db.sql;

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let matching: StubMatching;
  let perks: StubPerks;
  /** Futures OFF — the shipped default, and the service most deployments run. */
  let tradeOff: TradeService;
  /** Futures ON — one operator variable away from the one above. */
  let tradeOn: TradeService;
  let perp: Market;
  let spot: Market;

  const NOW = new Date('2026-08-06T12:00:00.000Z');

  /**
   * THE SMALLEST ORDER THIS LISTING CAN LEGALLY CARRY: 1e-16 of the base asset,
   * worth about 2e-13 USDT at these prices.
   *
   * Floors low enough that dust is a LEGAL order is deliberate, and it is the
   * whole reason the third block means anything. A market listed with
   * `min_notional: '1'` refuses a dust order at `assertNotional`, and a dust test
   * on such a market would pass while proving only that a LISTING PARAMETER was
   * doing the work. `min_notional` is chosen per listing by whoever lists the
   * market; `DEFAULT_MIN_BEST_LEVEL_NOTIONAL` is not. The gate under test is the
   * second one.
   *
   * Not 1e-18, because `markets_dust_free_ck` refuses a listing whose
   * `tick_size * lot_size` rounds below 1e-18 — a legal fill on such a market
   * would have a quote amount of nothing and the ledger refuses to post nothing.
   * At tick `0.01` the smallest lot the constraint permits is 1e-16, so this is
   * the LEAST DUSTY dust the schema allows, which makes it the strongest version
   * of the test: it is still fifteen orders of magnitude under the 100-unit floor.
   */
  const DUST_QTY = '0.0000000000000001';

  function listing(over: Partial<ListMarketInput> = {}): ListMarketInput {
    return {
      symbol: 'BTC/USDT-PERP',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      kind: 'futures',
      tickSize: amt('0.01'),
      lotSize: amt(DUST_QTY),
      minQty: amt(DUST_QTY),
      maxQty: null,
      minNotional: amt(DUST_QTY),
      makerBps: 0,
      takerBps: 0,
      ...over,
    };
  }

  /** Put real value in a user's available balance, the way a deposit would. */
  async function fund(userId: string, assetId: string, amount: string) {
    await ledger.post(
      recipes.deposit({ userId, assetId, amount: amt(amount), rail: 'test', railRef: `${userId}:${assetId}:${amount}:${randomUUID()}` }),
    );
  }

  const avail = async (userId: string, assetId: string) => formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
  const fees = async (assetId: string) => formatAmount((await ledger.balance(houseFees('trade', assetId))).amount);

  /**
   * THE BOOK, AS `trade.orders` ACTUALLY HOLDS IT.
   *
   * Open (and pending) rows only, unfilled remainder only, aggregated per price
   * level, bids high→low and asks low→high — svc-matching's own depth ordering.
   * A cancelled order leaves the book here because `finalize` moved its status,
   * not because this helper was told to forget it.
   */
  async function bookFromOrders(marketId: string): Promise<EngineDepth> {
    const rows = await sql<Array<{ side: string; price: string; remaining: string }>>`
      SELECT side, price::text AS price, (qty - filled_qty)::text AS remaining
        FROM trade.orders
       WHERE market_id = ${marketId}
         AND status IN ('open', 'pending')
         AND price IS NOT NULL
         AND qty > filled_qty
    `;

    const level = (want: string, dir: 1 | -1) => {
      const byPrice = new Map<string, bigint>();
      for (const r of rows.filter((r2) => r2.side === want)) {
        byPrice.set(r.price, (byPrice.get(r.price) ?? 0n) + amt(r.remaining));
      }
      return [...byPrice.entries()]
        .sort(([a], [b]) => (amt(a) < amt(b) ? -dir : amt(a) > amt(b) ? dir : 0))
        .map(([price, qty]) => [formatAmount(amt(price)), formatAmount(qty)] as readonly [string, string]);
    };

    return { bids: level('buy', 1), asks: level('sell', -1), sequence: rows.length };
  }

  /** Rest a maker order through the REAL order path and return its id. */
  async function rest(service: TradeService, userId: string, market: Market, side: 'buy' | 'sell', qty: string, price: string) {
    return service.placeOrder(principalFor(userId), {
      marketId: market.id,
      side,
      type: 'limit',
      qty: amt(qty),
      price: amt(price),
      clientOrderId: `${userId}-${side}-${price}-${qty}-${randomUUID()}`,
    });
  }

  const PROFIT_SOURCE = formatAccountRef(recipeProfitFundingAccount('USDT'));
  const profitPot = () => houseFees('trade', 'USDT');

  /**
   * Fund the profit pot the way it really fills — somebody else's realised loss
   * out of margin they had actually locked. Three real recipes, no fixture poking
   * a balance into place, so the ceiling asserted against is one the ledger
   * agrees exists. Lifted from `position-service.test.ts` for exactly that reason.
   */
  async function fundProfitSource(amount: string) {
    const seedPosition = `pot-seed-${randomUUID()}`;
    await ledger.post(
      recipes.deposit({ userId: CAROL, assetId: 'USDT', amount: amt(amount), rail: 'test', railRef: `pot-${randomUUID()}` }),
    );
    await ledger.post(recipes.futuresMarginLock({ positionId: seedPosition, userId: CAROL, assetId: 'USDT', amount: amt(amount) }));
    await ledger.post(
      recipes.futuresRealizeLoss({
        positionId: seedPosition,
        userId: CAROL,
        assetId: 'USDT',
        fromMargin: amt(amount),
        fromInsurance: 0n,
        lossId: seedPosition,
      }),
    );
  }

  /** A PositionService whose mark feed IS the book the order path built. */
  function positionsOnOrderBook(marketId: string) {
    return new PositionService(sql, ledger, {
      marks: markSourceFromDepth(async (id) => (id === marketId ? bookFromOrders(marketId) : null)),
      profitSource: profitSourceFromConfig(PROFIT_SOURCE),
      bus,
      now: () => NOW,
    });
  }

  beforeEach(async () => {
    await sql`TRUNCATE trade.positions, trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    matching = new StubMatching();
    perks = new StubPerks();

    tradeOff = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true, futuresEnabled: false });
    tradeOn = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true, futuresEnabled: true });

    // Listing is not enabling. This row exists on both services identically; the
    // only difference between them is one boolean.
    perp = await tradeOff.listMarket(listing());
    spot = await tradeOff.listMarket(
      listing({ symbol: 'BTC/USDT', kind: 'spot', lotSize: amt('0.0001'), minQty: amt('0.0001'), minNotional: amt('1') }),
    );
    expect(perp.kind).toBe('futures');
    expect(spot.kind).toBe('spot');
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  // ───────────────────────────────────────────────────────────────────────────
  // 1 · OFF IS AN ANSWER, NOT AN OUTAGE
  // ───────────────────────────────────────────────────────────────────────────

  describe('flag off — the default every deployment ships with', () => {
    it('refuses a futures order with trade.futures_disabled, and moves no money', async () => {
      await fund(ALICE, 'USDT', '1000');
      const before = await avail(ALICE, 'USDT');

      let code: string | null = null;
      try {
        await rest(tradeOff, ALICE, perp, 'buy', '0.001', '2000');
      } catch (err) {
        code = (err as TradeError).code;
      }

      expect(code).toBe('trade.futures_disabled');
      // NOT the code that tells a CCXT client to drop the symbol forever.
      expect(code).not.toBe('trade.market_kind_unsupported');

      // Nothing held, nothing spent, and no order row to reconcile later.
      expect(await avail(ALICE, 'USDT')).toBe(before);
      const orders = await sql<Array<{ n: string }>>`SELECT count(*)::text AS n FROM trade.orders`;
      expect(orders[0]!.n).toBe('0');
      // And nothing was even offered to the engine.
      expect(matching.submitted).toEqual([]);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    /**
     * THE DEFAULT, WITH NOTHING PASSED.
     *
     * Added after a revert probe found the gap: flipping
     * `this.futuresEnabled = options.futuresEnabled ?? false` to `?? true` broke no
     * assertion anywhere in the change, because every other test — including the
     * flag-off ones — passes `futuresEnabled` explicitly and so never exercises the
     * default. A default nothing tests is a default that can be reversed in a
     * one-character diff, and this one is the difference between shipping futures
     * off and shipping it on.
     */
    it('refuses futures on a service constructed without the option at all', async () => {
      const unconfigured = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true });
      await fund(ALICE, 'USDT', '1000');

      await expect(rest(unconfigured, ALICE, perp, 'buy', '0.001', '2000')).rejects.toMatchObject({
        code: 'trade.futures_disabled',
      });
      // Not a service that refuses everything — spot on the same instance works.
      expect((await rest(unconfigured, ALICE, spot, 'buy', '0.001', '2000')).status).toBe('open');
    });

    /**
     * `#883`/`#950`: a refusal whose only legal answer is one value is an outage
     * rather than a decision gate. These four assertions are what makes "off" a
     * product state — the same process, at the same moment, still doing every
     * other thing it is for.
     */
    it('is a decision and not an outage — spot still trades, and the futures market is still readable', async () => {
      await fund(ALICE, 'USDT', '1000');

      // Spot, on the same service instance that just refused futures.
      const order = await rest(tradeOff, ALICE, spot, 'buy', '0.001', '2000');
      expect(order.status).toBe('open');

      // The futures listing is not hidden, not delisted and not an error.
      const listed = await tradeOff.markets();
      expect(listed.map((m) => m.symbol).sort()).toEqual(['BTC/USDT', 'BTC/USDT-PERP']);
      expect(listed.find((m) => m.symbol === 'BTC/USDT-PERP')).toMatchObject({ kind: 'futures', status: 'active' });

      // And its book answers — an empty book is an answer, not a failure. The
      // public orderbook route is kind-agnostic and always has been; nothing in
      // this change had to open a read path, and this asserts none was closed.
      expect(await bookFromOrders(perp.id)).toEqual({ bids: [], asks: [], sequence: 0 });
    });

    /**
     * THE SWITCH MUST NOT TRAP FUNDS.
     *
     * The scenario is an operator turning futures off while orders are resting:
     * one service instance placed the order, a differently-configured one handles
     * the cancel, against the same rows and the same ledger. `TRADE_SPOT_ENABLED`
     * settled the general form of this — "a switch that traps funds is not a
     * safety control" — and a futures flag that refused the cancel would trap the
     * hold behind a book nobody is matching.
     */
    it('still cancels a resting futures order after the flag goes off, and releases the hold in full', async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await rest(tradeOn, ALICE, perp, 'buy', '0.001', '2000');
      expect(order.status).toBe('open');
      expect(await avail(ALICE, 'USDT')).toBe('998');

      const cancelled = await tradeOff.cancelOrder(principalFor(ALICE), order.id);
      expect(cancelled.status).toBe('cancelled');
      // THE BALANCE, not the status: every wei of the hold came back.
      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    /**
     * THE OTHER HALF OF NOT TRAPPING FUNDS: A FILL IN FLIGHT WHEN THE SWITCH GOES
     * OFF STILL SETTLES.
     *
     * `settleFillEvent` is the bus consumer, and it consults neither kill-switch —
     * correctly, and this asserts it stays that way. The engine has already matched
     * by the time the event arrives; refusing to post it because an operator flipped
     * a variable in between would leave the taker's hold standing against a fill the
     * book has already moved on from, which is the reconciliation case
     * `trade.hold_uncovered` exists to scream about. D-S-06's rule points the same
     * way: "Ledger post fails after a match → the fill did not happen" is about the
     * engine's record being corrected, not about the ledger being allowed to skip a
     * post it owes.
     */
    it('settles a futures fill that arrives on the bus after the flag went off', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '10000');

      const maker = await rest(tradeOn, BOB, perp, 'sell', '2', '2000');
      const taker = await rest(tradeOn, ALICE, perp, 'buy', '2', '2000');
      expect([maker.status, taker.status]).toEqual(['open', 'open']);

      // The operator flips the switch. Then the match lands.
      await tradeOff.settleFillEvent({
        marketId: perp.id,
        makerOrderId: maker.id,
        takerOrderId: taker.id,
        price: '2000',
        qty: '2',
        sequence: 99,
        makerAccountId: BOB,
        takerAccountId: ALICE,
      });

      // THE BALANCES: the fill settled in full, nothing left held, books closed.
      expect(await avail(ALICE, 'BTC')).toBe('2');
      expect(await avail(BOB, 'USDT')).toBe('4000');
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    /**
     * The two planes have two switches. An operator halting spot has not halted
     * futures, and the pre-resolution kill-switch must not swallow the futures
     * order on the way past.
     */
    it('takes a futures order while SPOT is killed — one plane per switch', async () => {
      const spotDead = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: false, futuresEnabled: true });
      await fund(ALICE, 'USDT', '1000');

      const order = await rest(spotDead, ALICE, perp, 'buy', '0.001', '2000');
      expect(order.status).toBe('open');

      await expect(rest(spotDead, ALICE, spot, 'buy', '0.001', '2000')).rejects.toMatchObject({ code: 'trade.spot_disabled' });
    });

    it('refuses futures for convert and TWAP even with the flag on — neither surface was built for it', async () => {
      await fund(ALICE, 'USDT', '1000');

      await expect(
        tradeOn.convertQuote(principalFor(ALICE, ['trade:read']), { marketId: perp.id, side: 'buy', qty: amt('0.001') }),
      ).rejects.toMatchObject({ code: 'trade.market_kind_unsupported' });

      await expect(
        tradeOn.createTwap(principalFor(ALICE), {
          marketId: perp.id,
          side: 'buy',
          totalQty: amt('0.001'),
          durationMs: 60_000,
          sliceIntervalMs: 20_000,
        }),
      ).rejects.toMatchObject({ code: 'trade.market_kind_unsupported' });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2 · ON — ORDER, MATCH, FILL, AND THE BALANCES SAY SO
  // ───────────────────────────────────────────────────────────────────────────

  describe('flag on — order → match → fill on a futures market', () => {
    /**
     * ASSERTED IN BALANCES, NOT IN STATUS CODES. This repo has been bitten
     * repeatedly by counting 200s, and D-S-06 is explicit that a fill is final
     * when the LEDGER has posted it — the engine's own record is a proposal. So
     * every line that matters below reads an account.
     *
     * Fees are 0 bps on this listing on purpose: a fee split is
     * `trade-service.test.ts`'s subject and would only make these numbers harder
     * to check by eye.
     */
    it('settles a futures fill through the ledger and closes the books', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '10000');

      const maker = await rest(tradeOn, BOB, perp, 'sell', '2', '2000');
      expect(maker.status).toBe('open');
      // The hold is posted BEFORE the engine is told anything — the invariant the
      // whole design rests on, and it holds on a futures market too.
      expect(await avail(BOB, 'BTC')).toBe('3');

      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '2000', qty: '2' }]);
      const taker = await rest(tradeOn, ALICE, perp, 'buy', '2', '2000');

      expect(taker.status).toBe('filled');
      expect(formatAmount(taker.filledQty)).toBe('2');

      // THE BALANCES. Alice paid 4,000 out of hold and received 2; Bob delivered
      // 2 out of hold and received 4,000.
      expect(await avail(ALICE, 'USDT')).toBe('6000');
      expect(await avail(ALICE, 'BTC')).toBe('2');
      expect(await avail(BOB, 'BTC')).toBe('3');
      expect(await avail(BOB, 'USDT')).toBe('4000');
      expect(await fees('USDT')).toBe('0');

      // Both legs recorded, and every asset nets to zero across every account —
      // nothing minted, nothing destroyed.
      const legs = await sql<Array<{ n: string }>>`SELECT count(*)::text AS n FROM trade.fills`;
      expect(legs[0]!.n).toBe('2');
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    /**
     * D-S-06 IS ACCEPTED: THERE IS NO SECOND BOOK.
     *
     * Read off the engine calls rather than asserted in prose. Both markets'
     * orders went to the same `MatchingClient`, and the futures order carried the
     * futures market's id — not a parallel id space, not a second client, not a
     * forked submit shape.
     */
    it('submits futures orders to the same matching client, under the futures market id', async () => {
      await fund(ALICE, 'USDT', '10000');

      await rest(tradeOn, ALICE, spot, 'buy', '0.001', '2000');
      await rest(tradeOn, ALICE, perp, 'buy', '0.001', '2000');

      expect(matching.submitted).toHaveLength(2);
      expect(matching.submitted.map((s) => s.marketId)).toEqual([spot.id, perp.id]);
      expect(new Set(matching.submitted.map((s) => s.marketId)).size).toBe(2);
    });

    it('produces a readable book from futures orders that rested', async () => {
      await fund(ALICE, 'USDT', '10000');
      await fund(BOB, 'BTC', '5');

      await rest(tradeOn, ALICE, perp, 'buy', '1', '1999');
      await rest(tradeOn, BOB, perp, 'sell', '1', '2001');

      const book = await bookFromOrders(perp.id);
      expect(book.bids[0]).toEqual(['1999', '1']);
      expect(book.asks[0]).toEqual(['2001', '1']);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3 · THE ONE THAT MATTERS: ORDERABILITY DID NOT RE-OPEN THE EXPLOIT
  // ───────────────────────────────────────────────────────────────────────────

  describe('the self-dealing exploit the old refusal was accidentally covering', () => {
    /**
     * Rest real size, open a position off the resulting mid, then pull the real
     * size and leave dust behind. Returns the position.
     *
     * Every order here goes through `placeOrder`, so on `main` — where
     * `assertTradable` refuses futures — this helper cannot run at all. That is
     * the point: the attack is now REACHABLE, and the assertions below are what
     * stops it paying.
     */
    async function positionThenDust(dustBid: string, dustAsk: string, dustQty: string) {
      await fundProfitSource('10000');
      await fund(ALICE, 'USDT', '100000');
      await fund(BOB, 'USDT', '100000');
      await fund(CAROL, 'BTC', '100');

      const positions = positionsOnOrderBook(perp.id);

      // A real two-sided book, built by real orders: mid 2000.
      const fatBid = await rest(tradeOn, BOB, perp, 'buy', '10', '1999');
      const fatAsk = await rest(tradeOn, CAROL, perp, 'sell', '10', '2001');
      expect(bestFromDepth(await bookFromOrders(perp.id))).toEqual({ bestBid: '1999', bestAsk: '2001' });

      const pos = await positions.open({ userId: ALICE, symbol: perp.symbol, side: 'long', size: amt('10'), leverage: amt('1') });
      expect(pos.entryPrice).toBe('2000');

      // Everything real is pulled — through the real cancel path, which releases
      // the makers' holds. What is left on the book is whatever `dustQty` is.
      await tradeOn.cancelOrder(principalFor(BOB), fatBid.id);
      await tradeOn.cancelOrder(principalFor(CAROL), fatAsk.id);
      expect(await bookFromOrders(perp.id)).toMatchObject({ bids: [], asks: [] });

      const restedBid = await rest(tradeOn, BOB, perp, 'buy', dustQty, dustBid);
      const restedAsk = await rest(tradeOn, CAROL, perp, 'sell', dustQty, dustAsk);
      // REACHABILITY, ASSERTED. The order path accepted both — this is not a test
      // that passes because the dust never made it onto the book.
      expect(restedBid.status).toBe('open');
      expect(restedAsk.status).toBe('open');

      return { positions, pos };
    }

    /**
     * THE MEASURED EXPLOIT, RUN THROUGH THE REAL ORDER PATH.
     *
     * `mark-from-depth.ts` records the number: 2,000 USDT paid out on a ten-unit
     * long against a book holding two orders worth about four femto-cents. The
     * move is 1,000 bps — inside `maxDeviationBps: 2_000` — so this measures the
     * DEPTH gate and nothing else.
     *
     * REVERT PROOF, VERIFIED BY RUNNING IT: drop the `bestLevelIsQuotable` call
     * from `bestFromDepth` so the mid is size-blind again, and the FIRST assertion
     * below goes red — the profit pot reads 8000 instead of 10000, because the dust
     * mid of 2200 paid 2,000 USDT out on a ten-unit long.
     *
     * THE BALANCE ASSERTIONS COME FIRST ON PURPOSE. Ordered the natural way — book
     * diagnostic, then `closing` status, then money — a revert goes red on the
     * diagnostic and the balance lines never execute, which would leave this file
     * claiming coverage of a payout it never actually measured. The money is the
     * subject; the two lines after it are the mechanism.
     */
    it('two dust orders placed through the real order path do not mint a payout', async () => {
      const { positions, pos } = await positionThenDust('2199', '2201', DUST_QTY);
      const aliceAfterOpen = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;

      const closed = await positions.close(ALICE, pos.id!);

      // THE MONEY, WHICH IS THE ONLY THING THIS TEST IS ABOUT.
      expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('10000');
      expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(aliceAfterOpen);
      expect(formatAmount((await ledger.balance(positionCollateralAccount(ALICE, 'USDT', pos.id!))).amount)).toBe('20000');
      expect(ledger.reconcile()).toEqual({ ok: true });

      // The mechanism behind those numbers. A close with no usable mark FREEZES
      // rather than failing (#995 / the dark-feed ADR) — refusing to price is not
      // refusing to release — and the reason it had no mark is that both sides of a
      // two-sided book were worth ~2e-13 quote units.
      expect(closed).toMatchObject({ status: 'closing', closingReason: 'trade.mark_missing' });
      expect(bestFromDepth(await bookFromOrders(perp.id))).toEqual({ bestBid: null, bestAsk: null });
    });

    /**
     * THE CONTROL, and it is not optional.
     *
     * Identical prices, real size behind them, and it pays. Without this the test
     * above is satisfied by a rule against profitable closes, and a mark gate that
     * refuses everything is not a gate — it is the outage `#883` warned about
     * wearing a safety control's clothes.
     */
    it('the same two prices with real size behind them DO pay out', async () => {
      const { positions, pos } = await positionThenDust('2199', '2201', '10');

      await positions.close(ALICE, pos.id!);

      // 100000 - 20000 margin + 20000 back + 10 x (2200 - 2000) = 102000
      expect(await avail(ALICE, 'USDT')).toBe('102000');
      expect(formatAmount((await ledger.balance(profitPot())).amount)).toBe('8000');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    /**
     * The other half of the same defect: `open()` must not mint an ENTRY price
     * from dust either, or the attacker sets their own basis. Same reachable path.
     */
    it('will not OPEN a position against a dust book the order path accepted, and locks nothing', async () => {
      await fund(ALICE, 'USDT', '100000');
      await fund(BOB, 'USDT', '100000');
      await fund(CAROL, 'BTC', '100');
      const positions = positionsOnOrderBook(perp.id);

      const bid = await rest(tradeOn, BOB, perp, 'buy', DUST_QTY, '1999');
      const ask = await rest(tradeOn, CAROL, perp, 'sell', DUST_QTY, '2001');
      expect([bid.status, ask.status]).toEqual(['open', 'open']);

      const before = (await ledger.balance(userAvailable(ALICE, 'USDT'))).amount;
      await expect(
        positions.open({ userId: ALICE, symbol: perp.symbol, side: 'long', size: amt('10'), leverage: amt('1') }),
      ).rejects.toMatchObject({ code: 'trade.mark_missing' });

      expect((await ledger.balance(userAvailable(ALICE, 'USDT'))).amount).toBe(before);
      expect(await positions.listOpen(ALICE)).toEqual([]);
    });
  });
}
