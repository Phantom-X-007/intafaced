import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { AuthError } from '@intafaced/auth';
import {
  InsufficientFundsError,
  MemoryLedger,
  formatAmount,
  houseFees,
  parseAmount as amt,
  recipes,
  userAvailable,
  orderHoldAccount,
} from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import { TradeError, type Market } from './types.js';
import { orderIdFor } from './ids.js';
import { StubMatching, StubPerks, UnreachableMatching, principalFor } from './testing.js';

/**
 * svc-trade money paths (§5.2).
 *
 * The ledger here is `MemoryLedger` — the reference implementation, which the
 * conformance suite proves behaves identically to svc-ledger's Postgres engine
 * (§4.4). That equivalence is what makes it legitimate: these tests are about
 * svc-trade's ORDERING, not about the ledger.
 *
 * Postgres is real, because the order row / ledger interaction is exactly where
 * a bug would hide — and because the release amount is derived from the fills
 * table, so "what does the database actually contain" is load-bearing.
 *
 * The matching engine is a stub (`./testing.ts` explains why). What is under
 * test is that funds are held before submission, that a fill draws the hold
 * down, that a cancel releases the remainder and only the remainder, and that
 * every one of those is idempotent.
 */

const URL = process.env.TEST_DATABASE_URL_TRADE ?? 'postgres://svc_trade:svc_trade@localhost:5433/intafaced';
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, '..', '..', 'drizzle', '0000_trade_init.sql'), 'utf8');

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';

async function reachable(): Promise<boolean> {
  const probe = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 2 });
  }
}

const available = await reachable();

if (!available) {
  describe.skip('svc-trade (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'trade,public', application_name: 'svc-trade-test' },
    onnotice: () => undefined,
  });

  await sql.unsafe(migration);

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let matching: StubMatching;
  let perks: StubPerks;
  let trade: TradeService;
  let btcusdt: Market;
  /** A second market with fat fees, so a rank discount is visible in integer bps. */
  let ethusdt: Market;

  /** Put real value in a user's available balance, the way a deposit would. */
  async function fund(userId: string, assetId: string, amount: string) {
    await ledger.post(
      recipes.deposit({ userId, assetId, amount: amt(amount), rail: 'test', railRef: `${userId}:${assetId}:${amount}:${Math.random()}` }),
    );
  }

  const avail = async (userId: string, assetId: string) => formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
  /**
   * Everything held for a user in an asset, summed across purposes (P0-3).
   *
   * Holds are per-order now, so "how much is held" is a sum rather than one
   * account. Every assertion below keeps its original meaning and gains reach:
   * a stray hold under any other purpose would now show up here.
   */
  const held = async (userId: string, assetId: string) => {
    const all = await ledger.balances('user', userId);
    return formatAmount(
      all.filter((b) => b.account.kind === 'hold' && b.account.assetId === assetId).reduce((acc, b) => acc + b.amount, 0n),
    );
  };
  /** The hold belonging to one specific order. */
  const heldFor = async (userId: string, assetId: string, orderId: string) =>
    formatAmount((await ledger.balance(orderHoldAccount(userId, assetId, orderId))).amount);
  const fees = async (assetId: string) => formatAmount((await ledger.balance(houseFees('trade', assetId))).amount);

  const postsWithReason = (reason: string) => ledger.journal().filter((tx) => tx.reason === reason);

  /** Rest a maker order for `userId` and return its id. */
  async function rest(userId: string, market: Market, side: 'buy' | 'sell', qty: string, price: string, clientOrderId: string) {
    return trade.placeOrder(principalFor(userId), {
      marketId: market.id,
      side,
      type: 'limit',
      qty: amt(qty),
      price: amt(price),
      clientOrderId,
    });
  }

  beforeEach(async () => {
    await sql`TRUNCATE trade.fills, trade.orders, trade.markets RESTART IDENTITY CASCADE`;
    ledger = new MemoryLedger();
    bus = new MemoryEventBus('svc-trade');
    matching = new StubMatching();
    perks = new StubPerks();
    trade = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: true, marketSlippageCapBps: 200 });

    btcusdt = await trade.listMarket({
      symbol: 'BTC/USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      tickSize: amt('0.01'),
      lotSize: amt('0.0001'),
      minQty: amt('0.0001'),
      maxQty: amt('1000'),
      minNotional: amt('1'),
      makerBps: 10,
      takerBps: 20,
    });

    ethusdt = await trade.listMarket({
      symbol: 'ETH/USDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      tickSize: amt('0.01'),
      lotSize: amt('0.001'),
      minQty: amt('0.001'),
      maxQty: null,
      minNotional: amt('1'),
      makerBps: 100,
      takerBps: 200,
    });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  // ── The happy path ────────────────────────────────────────────────────────

  describe('place → hold → fill → settle', () => {
    it('holds, matches, settles six entries, and the books close', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');

      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      expect(maker.status).toBe('open');
      expect(await held(BOB, 'BTC')).toBe('2');
      expect(await avail(BOB, 'BTC')).toBe('3');

      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);

      const taker = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        clientOrderId: 'alice-1',
      });

      expect(taker.status).toBe('filled');
      expect(formatAmount(taker.filledQty)).toBe('2');

      // Alice paid 200 USDT out of hold and received 2 BTC less a 20 bps taker fee.
      expect(await avail(ALICE, 'USDT')).toBe('800');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(await avail(ALICE, 'BTC')).toBe('1.996');

      // Bob delivered 2 BTC out of hold and received 200 USDT less a 10 bps maker fee.
      expect(await avail(BOB, 'BTC')).toBe('3');
      expect(await held(BOB, 'BTC')).toBe('0');
      expect(await avail(BOB, 'USDT')).toBe('199.8');

      expect(await fees('BTC')).toBe('0.004');
      expect(await fees('USDT')).toBe('0.2');

      // THE BOOK CLOSES. Every asset nets to zero across every account —
      // nothing was created, nothing destroyed.
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
      expect(ledger.reconcile()).toEqual({ ok: true });
      expect(ledger.verifyChain()).toEqual({ ok: true });
    });

    it('holds the funds BEFORE the engine ever sees the order', async () => {
      await fund(ALICE, 'USDT', '1000');

      let holdAtSubmit: string | null = null;
      matching.onSubmit = async (request) => {
        const tx = await ledger.getTxByKey(`order.hold:${request.orderId}`);
        // Read THIS order's own hold — the point is that this order is funded,
        // not that the user happens to have value held for something else.
        holdAtSubmit = tx ? await heldFor(ALICE, 'USDT', request.orderId) : null;
      };

      await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-order');

      // This is the invariant the whole engine design rests on: svc-matching is
      // allowed to be pure precisely because it never sees an unfunded order.
      expect(holdAtSubmit).toBe('200');
    });

    it('records both legs of the match and the taker/maker fee split', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');

      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);
      await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');

      const legs = await sql<Array<{ liquidity: string; fee_asset: string; fee_amount: string; fee_bps: string; quote_amount: string }>>`
        SELECT liquidity, fee_asset, fee_amount, fee_bps, quote_amount FROM trade.fills ORDER BY liquidity ASC
      `;
      expect(legs).toHaveLength(2);
      // Each side's fee comes out of what that side RECEIVED.
      expect(legs[0]).toMatchObject({ liquidity: 'maker', fee_asset: 'USDT' });
      expect(legs[1]).toMatchObject({ liquidity: 'taker', fee_asset: 'BTC' });
      expect(amt(legs[0]!.fee_amount)).toBe(amt('0.2'));
      expect(amt(legs[1]!.fee_amount)).toBe(amt('0.004'));
    });

    it('emits XP per filled order (§5.2 step 4)', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');

      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);
      await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');

      const emitted = bus.emitted('xpEarned');
      expect(emitted).toHaveLength(2);
      expect(emitted.map((e) => e.payload.userId).sort()).toEqual([ALICE, BOB].sort());
      expect(emitted.every((e) => e.payload.sourceModule === 'trade')).toBe(true);
    });
  });

  // ── Failure: the hold is refused ──────────────────────────────────────────

  describe('insufficient funds', () => {
    it('creates NO order row and never reaches the engine', async () => {
      await fund(ALICE, 'USDT', '10');

      await expect(rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-broke')).rejects.toBeInstanceOf(InsufficientFundsError);

      // The intent row is removed, so a refused order leaves nothing behind.
      const rows = await sql`SELECT id FROM trade.orders`;
      expect(rows).toHaveLength(0);

      // And the engine was never asked. An order the engine holds but the
      // ledger never funded is the failure this ordering exists to prevent.
      expect(matching.submitted).toHaveLength(0);

      expect(await avail(ALICE, 'USDT')).toBe('10');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses a sell the user cannot deliver', async () => {
      await fund(BOB, 'BTC', '0.5');
      await expect(rest(BOB, btcusdt, 'sell', '2', '100', 'bob-broke')).rejects.toBeInstanceOf(InsufficientFundsError);
      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(0);
      expect(matching.submitted).toHaveLength(0);
    });

    it('leaves no pending row behind after a refused hold, even on retry', async () => {
      await fund(ALICE, 'USDT', '10');
      await expect(rest(ALICE, btcusdt, 'buy', '2', '100', 'same-key')).rejects.toThrow();
      await expect(rest(ALICE, btcusdt, 'buy', '2', '100', 'same-key')).rejects.toThrow();
      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(0);
    });
  });

  // ── Failure: cancel before any fill ───────────────────────────────────────

  describe('cancel before fill', () => {
    it('releases the hold in full', async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');
      expect(await held(ALICE, 'USDT')).toBe('200');

      const cancelled = await trade.cancelOrder(principalFor(ALICE), order.id);

      expect(cancelled.status).toBe('cancelled');
      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('releases a sell hold in the base asset', async () => {
      await fund(BOB, 'BTC', '5');
      const order = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      await trade.cancelOrder(principalFor(BOB), order.id);
      expect(await avail(BOB, 'BTC')).toBe('5');
      expect(await held(BOB, 'BTC')).toBe('0');
    });

    it('refuses a second cancel and does NOT release twice', async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');
      await trade.cancelOrder(principalFor(ALICE), order.id);

      await expect(trade.cancelOrder(principalFor(ALICE), order.id)).rejects.toMatchObject({ code: 'trade.order_not_open' });

      // A redelivered `intafaced.matching.order.cancelled` takes the same path
      // and must also be a no-op — at-least-once is the only delivery there is.
      await trade.releaseOnCancelEvent(order.id);

      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it("will not let one user cancel another user's order", async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');

      await expect(trade.cancelOrder(principalFor(CAROL), order.id)).rejects.toMatchObject({ code: 'trade.order_not_found' });
      expect(await held(ALICE, 'USDT')).toBe('200');
    });

    it('still releases when the engine says the order is not live', async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');
      matching.scriptCancelMiss(order.id);

      await trade.cancelOrder(principalFor(ALICE), order.id);

      // The engine not knowing the order is an answer, not a failure — and the
      // hold still has to come back, or it never does.
      expect(await avail(ALICE, 'USDT')).toBe('1000');
    });
  });

  // ── THE double-release trap ───────────────────────────────────────────────

  describe('partial fill then cancel', () => {
    it('releases only the unfilled remainder, exactly once', async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-1');

      // Alice buys 10 @ 100 (hold 1000) but only 4 match; 6 rest.
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '4' }], { restRemainder: '6' });
      const order = await rest(ALICE, btcusdt, 'buy', '10', '100', 'alice-1');

      expect(order.status).toBe('open');
      expect(formatAmount(order.filledQty)).toBe('4');
      expect(await held(ALICE, 'USDT')).toBe('600');
      expect(await avail(ALICE, 'BTC')).toBe('3.992');

      await trade.cancelOrder(principalFor(ALICE), order.id);

      // 1000 held, 400 spent on the fill, 600 back. Not 1000 back, and not
      // 600 twice — this is where a double-release bug lives.
      expect(await avail(ALICE, 'USDT')).toBe('1600');
      expect(await held(ALICE, 'USDT')).toBe('0');

      const releases = postsWithReason('order.hold.released');
      expect(releases).toHaveLength(1);
      expect(releases[0]!.idempotencyKey).toBe(`order.release:${order.id}:0`);

      expect(ledger.reconcile()).toEqual({ ok: true });
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('a redelivered cancel event after a partial fill releases nothing more', async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '4' }], { restRemainder: '6' });
      const order = await rest(ALICE, btcusdt, 'buy', '10', '100', 'alice-1');

      await trade.cancelOrder(principalFor(ALICE), order.id);
      await trade.releaseOnCancelEvent(order.id);
      await trade.releaseOnCancelEvent(order.id);

      expect(await avail(ALICE, 'USDT')).toBe('1600');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it('releases the remainder of an IOC order the engine cancelled for us', async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '4' }], { cancelRemainder: '6' });

      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('10'),
        price: amt('100'),
        tif: 'IOC',
        clientOrderId: 'alice-ioc',
      });

      expect(order.status).toBe('cancelled');
      expect(formatAmount(order.filledQty)).toBe('4');
      expect(await avail(ALICE, 'USDT')).toBe('1600');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
    });

    it('releases the hold of a resting order pulled by self-trade prevention', async () => {
      await fund(ALICE, 'USDT', '2000');
      await fund(ALICE, 'BTC', '5');

      const resting = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-resting');
      expect(await held(ALICE, 'USDT')).toBe('200');

      // Alice now sells into her own bid. §5.1 pulls the older resting order.
      matching.scriptSelfTradePrevention(resting.id, ALICE, '2');
      await rest(ALICE, btcusdt, 'sell', '2', '100', 'alice-aggressor');

      const pulled = await trade.getOrder(principalFor(ALICE, ['trade:read']), resting.id);
      expect(pulled.status).toBe('cancelled');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(await avail(ALICE, 'USDT')).toBe('2000');
      // The aggressor's own base hold is untouched — it is still in the book.
      expect(await held(ALICE, 'BTC')).toBe('2');
    });
  });

  // ── Retries ───────────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('a retry with the same client order id holds once and submits once', async () => {
      await fund(ALICE, 'USDT', '2000');

      const first = await rest(ALICE, btcusdt, 'buy', '2', '100', 'retry-me');
      const second = await rest(ALICE, btcusdt, 'buy', '2', '100', 'retry-me');
      const third = await rest(ALICE, btcusdt, 'buy', '2', '100', 'retry-me');

      expect(second.id).toBe(first.id);
      expect(third.id).toBe(first.id);
      expect(first.id).toBe(orderIdFor(ALICE, btcusdt.id, 'retry-me'));

      // One row, one hold, one engine submission.
      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(1);
      expect(matching.submitted).toHaveLength(1);
      expect(postsWithReason('order.hold')).toHaveLength(1);
      expect(await held(ALICE, 'USDT')).toBe('200');
      expect(await avail(ALICE, 'USDT')).toBe('1800');
    });

    it('the same client id from a different user is a different order', async () => {
      await fund(ALICE, 'USDT', '1000');
      await fund(CAROL, 'USDT', '1000');

      const a = await rest(ALICE, btcusdt, 'buy', '2', '100', 'order-1');
      const c = await rest(CAROL, btcusdt, 'buy', '2', '100', 'order-1');

      expect(a.id).not.toBe(c.id);
      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(2);
    });

    it('concurrent identical submissions produce one order and one hold', async () => {
      await fund(ALICE, 'USDT', '2000');

      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          rest(ALICE, btcusdt, 'buy', '2', '100', 'racy')
            .then((o) => o.id)
            .catch(() => 'failed'),
        ),
      );

      const ids = new Set(results.filter((r) => r !== 'failed'));
      expect(ids.size).toBe(1);
      expect(postsWithReason('order.hold')).toHaveLength(1);
      expect(await held(ALICE, 'USDT')).toBe('200');
    });

    it('a redelivered fill event settles nothing a second time', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');

      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);
      const taker = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');

      const sequence = (await sql<Array<{ sequence: number }>>`SELECT sequence FROM trade.fills LIMIT 1`)[0]!.sequence;

      // The engine publishes every match to NATS regardless of who submitted
      // it, so this is the ordinary recovery path, not an exotic one.
      await trade.settleFillEvent({
        marketId: btcusdt.id,
        makerOrderId: maker.id,
        takerOrderId: taker.id,
        price: '100',
        qty: '2',
        sequence,
      });

      expect(postsWithReason('trade.fill')).toHaveLength(1);
      expect(await sql`SELECT id FROM trade.fills`).toHaveLength(2);
      expect(await avail(ALICE, 'BTC')).toBe('1.996');
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
    });
  });

  // ── Fee tiers ─────────────────────────────────────────────────────────────

  describe('rank fee discount', () => {
    it('a discounted taker pays strictly less, and the house receives strictly less', async () => {
      // Rank 7 — 350 bps off. ETH/USDT charges 200 bps taker, so the discount
      // is representable in integer basis points.
      perks.discounts.set(ALICE, 350);

      await fund(BOB, 'ETH', '10');
      await fund(ALICE, 'USDT', '1000');
      await fund(CAROL, 'USDT', '1000');

      const maker1 = await rest(BOB, ethusdt, 'sell', '1', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker1.id, makerAccountId: BOB, price: '100', qty: '1' }]);
      await rest(ALICE, ethusdt, 'buy', '1', '100', 'alice-1');

      const maker2 = await rest(BOB, ethusdt, 'sell', '1', '100', 'bob-2');
      matching.scriptFills([{ makerOrderId: maker2.id, makerAccountId: BOB, price: '100', qty: '1' }]);
      await rest(CAROL, ethusdt, 'buy', '1', '100', 'carol-1');

      // 200 bps on 1 ETH = 0.02. With 350 bps off the rate: 193 bps = 0.0193.
      expect(await avail(ALICE, 'ETH')).toBe('0.9807');
      expect(await avail(CAROL, 'ETH')).toBe('0.98');

      const discounted = amt(await avail(ALICE, 'ETH'));
      const full = amt(await avail(CAROL, 'ETH'));
      expect(discounted).toBeGreaterThan(full);

      const rates = await sql<Array<{ fee_bps: string }>>`
        SELECT fee_bps FROM trade.fills WHERE user_id = ${ALICE} AND liquidity = 'taker'
      `;
      expect(Number(rates[0]!.fee_bps)).toBe(193);

      expect(ledger.totalsByAsset()).toEqual({ ETH: '0', USDT: '0' });
    });

    it('snapshots the discount on the order, so a later rank change cannot re-price it', async () => {
      perks.discounts.set(ALICE, 350);

      await fund(BOB, 'ETH', '10');
      await fund(ALICE, 'USDT', '1000');

      const maker = await rest(BOB, ethusdt, 'sell', '1', '100', 'bob-1');
      const order = await rest(ALICE, ethusdt, 'buy', '1', '100', 'alice-1');
      expect(order.feeDiscountBps).toBe(350);

      // Alice is demoted to rank 0 AFTER placing, but before the fill.
      perks.discounts.set(ALICE, 0);

      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '1' }]);
      const second = await rest(ALICE, ethusdt, 'buy', '1', '100', 'alice-2');
      expect(second.feeDiscountBps).toBe(0);

      // The order placed on the old terms keeps them.
      const kept = await trade.getOrder(principalFor(ALICE, ['trade:read']), order.id);
      expect(kept.feeDiscountBps).toBe(350);
    });

    it('fails closed when the perk table cannot be read — before anything is held', async () => {
      await fund(ALICE, 'USDT', '1000');
      perks.unavailable = true;

      await expect(rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1')).rejects.toThrow();

      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(0);
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(matching.submitted).toHaveLength(0);
    });
  });

  // ── Engine rejections and risk refusals ───────────────────────────────────

  describe('refusals', () => {
    it('returns the whole hold when the engine rejects the order', async () => {
      await fund(ALICE, 'USDT', '1000');
      matching.scriptRejection('post_only_would_cross');

      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('2'),
        price: amt('100'),
        tif: 'PO',
        clientOrderId: 'alice-po',
      });

      expect(order.status).toBe('rejected');
      expect(order.rejectCode).toBe('post_only_would_cross');
      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });

    it('refuses without a scope, before reading anything', async () => {
      await fund(ALICE, 'USDT', '1000');

      await expect(
        trade.placeOrder(principalFor(ALICE, ['trade:read']), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('2'),
          price: amt('100'),
        }),
      ).rejects.toBeInstanceOf(AuthError);

      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(0);
      expect(await held(ALICE, 'USDT')).toBe('0');
    });

    it('refuses on a halted market, and holds nothing', async () => {
      await fund(ALICE, 'USDT', '1000');
      await trade.setMarketStatus(btcusdt.id, 'halted');

      await expect(rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1')).rejects.toMatchObject({
        code: 'trade.market_not_tradable',
      });
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(matching.submitted).toHaveLength(0);
    });

    it('lets a user out of a halted market — cancelling is not gated', async () => {
      await fund(ALICE, 'USDT', '1000');
      const order = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');
      await trade.setMarketStatus(btcusdt.id, 'halted');

      const cancelled = await trade.cancelOrder(principalFor(ALICE), order.id);
      expect(cancelled.status).toBe('cancelled');
      expect(await avail(ALICE, 'USDT')).toBe('1000');
    });

    it('refuses when the kill-switch is off, and holds nothing', async () => {
      const off = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: false });
      await fund(ALICE, 'USDT', '1000');

      await expect(
        off.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('2'),
          price: amt('100'),
        }),
      ).rejects.toMatchObject({ code: 'trade.spot_disabled' });

      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(matching.submitted).toHaveLength(0);
    });

    it('refuses an off-grid price and an off-grid quantity before any hold', async () => {
      await fund(ALICE, 'USDT', '1000');

      await expect(rest(ALICE, btcusdt, 'buy', '2', '100.005', 'bad-price')).rejects.toMatchObject({
        code: 'trade.invalid_price',
      });
      await expect(rest(ALICE, btcusdt, 'buy', '2.00005', '100', 'bad-qty')).rejects.toMatchObject({
        code: 'trade.invalid_qty',
      });
      await expect(rest(ALICE, btcusdt, 'buy', '0.0001', '100', 'dust')).rejects.toMatchObject({
        code: 'trade.below_min_notional',
      });

      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(matching.submitted).toHaveLength(0);
    });

    it('refuses a stop order — funding one is not solved (SOCKET §13)', async () => {
      await fund(ALICE, 'USDT', '1000');
      await expect(
        trade.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'stop_limit',
          qty: amt('2'),
          price: amt('100'),
        }),
      ).rejects.toMatchObject({ code: 'trade.order_type_unsupported' });
      expect(await held(ALICE, 'USDT')).toBe('0');
    });

    it('keeps the hold when the engine is unreachable — the order may be live', async () => {
      const unreachable = new UnreachableMatching();
      const service = new TradeService(sql, ledger, unreachable, perks, bus, { spotEnabled: true });
      await fund(ALICE, 'USDT', '1000');

      await expect(
        service.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('2'),
          price: amt('100'),
          clientOrderId: 'indeterminate',
        }),
      ).rejects.toThrow(/unreachable/);

      // Releasing here would be the bug: if the engine DID take the order, a
      // fill would land against money that had been given back.
      const orderId = orderIdFor(ALICE, btcusdt.id, 'indeterminate');
      const order = await service.findOrder(orderId);
      expect(order?.status).toBe('open');
      expect(await held(ALICE, 'USDT')).toBe('200');

      // Recovery: cancel. The engine answers "not live" and the hold comes back.
      await service.cancelOrder(principalFor(ALICE), orderId);
      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(await held(ALICE, 'USDT')).toBe('0');
    });
  });

  // ── Market orders ─────────────────────────────────────────────────────────

  describe('market orders', () => {
    it('funds a market buy at a protection price and releases what it did not spend', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');
      matching.asks = [['100', '5']];

      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);

      const order = await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'market',
        qty: amt('2'),
        clientOrderId: 'alice-mkt',
      });

      // Funded at 100 + 2% = 102 -> 204 held; only 200 was spent, and the
      // difference comes straight back rather than sitting in `hold` forever.
      expect(formatAmount(order.holdAmount)).toBe('204');
      expect(order.status).toBe('filled');
      expect(await avail(ALICE, 'USDT')).toBe('800');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(await avail(ALICE, 'BTC')).toBe('1.996');
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
    });

    it('submits a market buy to the engine as a marketable IOC limit at the protection price', async () => {
      await fund(ALICE, 'USDT', '1000');
      matching.asks = [['100', '5']];

      await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'market',
        qty: amt('2'),
        clientOrderId: 'alice-mkt',
      });

      // The engine therefore CANNOT fill it above what was held. That is the
      // whole reason the mapping exists.
      expect(matching.submitted[0]!.request).toMatchObject({ type: 'limit', price: '102', tif: 'IOC' });
    });

    it('submits a market sell as a market order — base is held exactly', async () => {
      await fund(BOB, 'BTC', '5');

      await trade.placeOrder(principalFor(BOB), {
        marketId: btcusdt.id,
        side: 'sell',
        type: 'market',
        qty: amt('2'),
        clientOrderId: 'bob-mkt',
      });

      expect(matching.submitted[0]!.request).toMatchObject({ type: 'market', price: null, tif: 'IOC' });
      expect(await held(BOB, 'BTC')).toBe('2');
    });

    it('refuses a market buy with no ask to price against', async () => {
      await fund(ALICE, 'USDT', '1000');
      matching.asks = [];

      await expect(
        trade.placeOrder(principalFor(ALICE), { marketId: btcusdt.id, side: 'buy', type: 'market', qty: amt('2') }),
      ).rejects.toMatchObject({ code: 'trade.no_reference_price' });

      expect(await held(ALICE, 'USDT')).toBe('0');
    });
  });

  // ── Doctrine ──────────────────────────────────────────────────────────────

  describe('doctrine §0.6 — no balance outside the ledger', () => {
    it("filled_qty always equals the sum of the order's fills", async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-1');
      matching.scriptFills(
        [
          { makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '3' },
          { makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' },
        ],
        { restRemainder: '5' },
      );
      const taker = await rest(ALICE, btcusdt, 'buy', '10', '100', 'alice-1');

      const rows = await sql<Array<{ id: string; filled_qty: string; summed: string }>>`
        SELECT o.id, o.filled_qty, COALESCE((SELECT SUM(f.qty) FROM trade.fills f WHERE f.order_id = o.id), 0) AS summed
          FROM trade.orders o
      `;
      for (const row of rows) expect(amt(row.filled_qty)).toBe(amt(row.summed));

      const takerRow = rows.find((r) => r.id === taker.id)!;
      expect(amt(takerRow.filled_qty)).toBe(amt('5'));
    });

    it("every open order's hold is exactly what the ledger says it holds", async () => {
      await fund(ALICE, 'USDT', '5000');
      await fund(ALICE, 'BTC', '5');

      await rest(ALICE, btcusdt, 'buy', '2', '100', 'a1');
      await rest(ALICE, btcusdt, 'buy', '3', '200', 'a2');
      await rest(ALICE, btcusdt, 'sell', '1', '300', 'a3');

      // Two independent answers to "what is locked": this service's order rows,
      // and the ledger's hold accounts. That they CAN be compared is the point
      // of keeping value in the ledger and only order state here.
      const rows = await sql<Array<{ hold_asset: string; total: string }>>`
        SELECT hold_asset, SUM(hold_amount) AS total FROM trade.orders WHERE status = 'open' GROUP BY hold_asset
      `;
      const byAsset = Object.fromEntries(rows.map((r) => [r.hold_asset, amt(r.total)]));

      expect(byAsset.USDT).toBe(amt(await held(ALICE, 'USDT')));
      expect(byAsset.BTC).toBe(amt(await held(ALICE, 'BTC')));
      expect(formatAmount(byAsset.USDT!)).toBe('800');
    });

    it('holds no numeric balance column of its own — hold_amount never changes', async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '4' }], { restRemainder: '6' });
      const order = await rest(ALICE, btcusdt, 'buy', '10', '100', 'alice-1');

      const after = await sql<Array<{ hold_amount: string }>>`SELECT hold_amount FROM trade.orders WHERE id = ${order.id}`;
      // The hold is recorded, not tracked. What is still owed is derived from
      // the fills, so there is no third number that could disagree with the
      // other two.
      expect(amt(after[0]!.hold_amount)).toBe(amt('1000'));
    });
  });

  // ── Reconciliation over a mixed run ───────────────────────────────────────

  describe('reconciliation', () => {
    it('is clean after a run of mixed operations', async () => {
      await fund(ALICE, 'USDT', '10000');
      await fund(BOB, 'BTC', '20');
      await fund(CAROL, 'USDT', '5000');
      await fund(CAROL, 'ETH', '10');
      perks.discounts.set(CAROL, 275);

      // 1 · a full fill
      const m1 = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-1');
      matching.scriptFills([{ makerOrderId: m1.id, makerAccountId: BOB, price: '100', qty: '2' }]);
      await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-1');

      // 2 · a partial fill that then rests, then is cancelled
      const m2 = await rest(BOB, btcusdt, 'sell', '10', '101', 'bob-2');
      matching.scriptFills([{ makerOrderId: m2.id, makerAccountId: BOB, price: '101', qty: '4' }], { restRemainder: '6' });
      const partial = await rest(ALICE, btcusdt, 'buy', '10', '101', 'alice-2');
      await trade.cancelOrder(principalFor(ALICE), partial.id);

      // 3 · an order cancelled untouched
      const untouched = await rest(ALICE, btcusdt, 'buy', '1', '90', 'alice-3');
      await trade.cancelOrder(principalFor(ALICE), untouched.id);

      // 4 · an engine rejection
      matching.scriptRejection('fok_unfillable');
      await trade.placeOrder(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        type: 'limit',
        qty: amt('1'),
        price: amt('95'),
        tif: 'FOK',
        clientOrderId: 'alice-fok',
      });

      // 5 · a discounted fill on the fat-fee market
      const m3 = await rest(CAROL, ethusdt, 'sell', '2', '50', 'carol-1');
      matching.scriptFills([{ makerOrderId: m3.id, makerAccountId: CAROL, price: '50', qty: '2' }]);
      await rest(ALICE, ethusdt, 'buy', '2', '50', 'alice-4');

      // 6 · a retry of something already placed
      await rest(ALICE, btcusdt, 'buy', '1', '90', 'alice-3');

      // 7 · redelivered events over the whole run
      for (const row of await sql<Array<{ order_id: string }>>`SELECT DISTINCT order_id FROM trade.fills`) {
        await trade.releaseOnCancelEvent(row.order_id);
      }

      expect(ledger.reconcile()).toEqual({ ok: true });
      expect(ledger.verifyChain()).toEqual({ ok: true });
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', ETH: '0', USDT: '0' });

      // No user's hold ever went negative, and no order over-consumed its hold.
      for (const user of [ALICE, BOB, CAROL]) {
        for (const asset of ['BTC', 'ETH', 'USDT']) {
          expect(amt(await held(user, asset))).toBeGreaterThanOrEqual(0n);
          expect(amt(await avail(user, asset))).toBeGreaterThanOrEqual(0n);
        }
      }

      // Every terminal order has nothing left held against it.
      const terminal = await sql<Array<{ id: string; hold_amount: string; consumed: string }>>`
        SELECT o.id, o.hold_amount,
               COALESCE((SELECT SUM(CASE WHEN o.side = 'buy' THEN f.quote_amount ELSE f.qty END)
                           FROM trade.fills f WHERE f.order_id = o.id), 0) AS consumed
          FROM trade.orders o WHERE o.status IN ('filled', 'cancelled', 'rejected', 'expired')
      `;
      for (const row of terminal) expect(amt(row.hold_amount)).toBeGreaterThanOrEqual(amt(row.consumed));
    });
  });

  describe('trade.convert — one-tap RFQ', () => {
    beforeEach(() => {
      trade = new TradeService(sql, ledger, matching, perks, bus, {
        spotEnabled: true,
        marketSlippageCapBps: 200,
        convertEnabled: true,
        convertSpreadBps: 10,
      });
      matching.asks = [['100', '10']];
      matching.bids = [['99', '10']];
    });

    it('quotes a buy against asks with house convert spread', async () => {
      const quote = await trade.convertQuote(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        qty: amt('1'),
      });
      expect(quote.symbol).toBe('BTC/USDT');
      expect(quote.fullyFilled).toBe(true);
      expect(quote.convertSpreadBps).toBe(10);
      // Book 100 + 10 bps → user pays more than mid
      expect(amt(quote.userNotional)).toBeGreaterThan(amt(quote.bookNotional));
    });

    it('refuses to quote when the book is empty', async () => {
      matching.asks = [];
      await expect(trade.convertQuote(principalFor(ALICE), { marketId: btcusdt.id, side: 'buy', qty: amt('1') })).rejects.toMatchObject({
        code: 'trade.convert_no_liquidity',
      });
    });

    it('executes via market IOC and is idempotent on clientConvertId', async () => {
      await fund(ALICE, 'USDT', '1000');
      await fund(BOB, 'BTC', '5');
      const maker = await rest(BOB, btcusdt, 'sell', '1', '100', 'bob-convert-maker');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '1' }]);

      const first = await trade.convertExecute(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        qty: amt('1'),
        clientConvertId: 'tap-1',
      });
      expect(first.clientOrderId).toBe('convert:tap-1');
      expect(['filled', 'open', 'cancelled']).toContain(first.status);

      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '1' }]);
      const second = await trade.convertExecute(principalFor(ALICE), {
        marketId: btcusdt.id,
        side: 'buy',
        qty: amt('1'),
        clientConvertId: 'tap-1',
      });
      expect(second.id).toBe(first.id);
      // One hold post for this convert id — retry does not double-hold.
      expect(postsWithReason('order.hold').filter((tx) => tx.idempotencyKey.includes(first.id))).toHaveLength(1);
    });

    it('refuses execute when maxAvgPrice is breached on a buy', async () => {
      await fund(ALICE, 'USDT', '1000');
      matching.asks = [['200', '10']];
      await expect(
        trade.convertExecute(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          qty: amt('1'),
          clientConvertId: 'too-expensive',
          maxAvgPrice: amt('150'),
        }),
      ).rejects.toMatchObject({ code: 'trade.convert_price_moved' });
      expect(matching.submitted).toHaveLength(0);
    });

    it('honours the convert kill-switch', async () => {
      trade = new TradeService(sql, ledger, matching, perks, bus, { convertEnabled: false });
      await expect(trade.convertQuote(principalFor(ALICE), { marketId: btcusdt.id, side: 'buy', qty: amt('1') })).rejects.toMatchObject({
        code: 'trade.convert_disabled',
      });
    });
  });
}
