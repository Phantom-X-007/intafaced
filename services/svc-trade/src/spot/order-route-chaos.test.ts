import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger, formatAmount, parseAmount as amt, recipes, userAvailable, orderHoldAccount } from '@intafaced/ledger-client';
import { TradeService } from './trade-service.js';
import type { Market } from './types.js';
import { orderIdFor } from './ids.js';
import { StubMatching, StubPerks, UnreachableMatching, principalFor } from './testing.js';

/**
 * Order-route chaos spine (Spec CX-7 · Plan P1-1 · Architect Seam B1).
 *
 * In-process: real TradeService + MemoryLedger + StubMatching. Named F1–F4 so
 * the readiness scoreboard can point at a single green suite. Steady state S:
 * ledger conserved, no double hold/fill/release, open orders reconcilable.
 *
 * F5–F8 land in a later task (P1-4).
 */

const URL = process.env.TEST_DATABASE_URL_TRADE ?? 'postgres://svc_trade:svc_trade@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

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
  describe.skip('order-route chaos F1–F4 (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'trade,public', application_name: 'svc-trade-chaos' },
    onnotice: () => undefined,
  });

  await assertTestDatabase(sql, 'svc-trade-chaos');
  for (const migration of migrations) await sql.unsafe(migration);

  let ledger: MemoryLedger;
  let bus: MemoryEventBus;
  let matching: StubMatching;
  let perks: StubPerks;
  let trade: TradeService;
  let btcusdt: Market;

  async function fund(userId: string, assetId: string, amount: string) {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId,
        amount: amt(amount),
        rail: 'test',
        railRef: `${userId}:${assetId}:${amount}:${Math.random()}`,
      }),
    );
  }

  const avail = async (userId: string, assetId: string) => formatAmount((await ledger.balance(userAvailable(userId, assetId))).amount);
  const held = async (userId: string, assetId: string) => {
    const all = await ledger.balances('user', userId);
    return formatAmount(
      all.filter((b) => b.account.kind === 'hold' && b.account.assetId === assetId).reduce((acc, b) => acc + b.amount, 0n),
    );
  };
  const heldFor = async (userId: string, assetId: string, orderId: string) =>
    formatAmount((await ledger.balance(orderHoldAccount(userId, assetId, orderId))).amount);
  const postsWithReason = (reason: string) => ledger.journal().filter((tx) => tx.reason === reason);

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
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  describe('chaos F1 — concurrent same clientOrderId', () => {
    it('one order, one hold, one engine submit under concurrent place', async () => {
      await fund(ALICE, 'USDT', '2000');

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          rest(ALICE, btcusdt, 'buy', '2', '100', 'chaos-f1')
            .then((o) => o.id)
            .catch(() => 'failed'),
        ),
      );

      const ids = new Set(results.filter((r) => r !== 'failed'));
      expect(ids.size).toBe(1);
      expect(await sql`SELECT id FROM trade.orders`).toHaveLength(1);
      expect(postsWithReason('order.hold')).toHaveLength(1);
      expect(matching.submitted).toHaveLength(1);
      expect(await held(ALICE, 'USDT')).toBe('200');
      expect(await avail(ALICE, 'USDT')).toBe('1800');
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  describe('chaos F2 — fill redelivery', () => {
    it('redelivered fill settles once (idempotent on engine business key)', async () => {
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');

      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-f2');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '2' }]);
      const taker = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-f2');

      const sequence = (await sql<Array<{ sequence: number }>>`SELECT sequence FROM trade.fills LIMIT 1`)[0]!.sequence;

      // Ordinary bus redelivery path — settle again with the same sequence.
      for (let i = 0; i < 5; i++) {
        await trade.settleFillEvent({
          marketId: btcusdt.id,
          makerOrderId: maker.id,
          takerOrderId: taker.id,
          price: '100',
          qty: '2',
          sequence,
        });
      }

      expect(postsWithReason('trade.fill')).toHaveLength(1);
      expect(await sql`SELECT id FROM trade.fills`).toHaveLength(2);
      expect(await avail(ALICE, 'BTC')).toBe('1.996');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  describe('chaos F3 — partial cancel remainder once', () => {
    it('cancel after partial fill releases only remainder; redelivery releases nothing more', async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');

      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-f3');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '4' }], { restRemainder: '6' });
      const order = await rest(ALICE, btcusdt, 'buy', '10', '100', 'alice-f3');

      expect(order.status).toBe('open');
      expect(formatAmount(order.filledQty)).toBe('4');
      expect(await held(ALICE, 'USDT')).toBe('600');

      await trade.cancelOrder(principalFor(ALICE), order.id);
      // Redelivered cancel event (engine → bus → trade).
      await trade.releaseOnCancelEvent(order.id);
      await trade.releaseOnCancelEvent(order.id);

      expect(await avail(ALICE, 'USDT')).toBe('1600');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  describe('chaos F4 — matching transport fail after hold', () => {
    it('order stays open with hold; cancel recovers full funds', async () => {
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
          clientOrderId: 'chaos-f4',
        }),
      ).rejects.toThrow(/unreachable/);

      const orderId = orderIdFor(ALICE, btcusdt.id, 'chaos-f4');
      const order = await service.findOrder(orderId);
      expect(order?.status).toBe('open');
      expect(await heldFor(ALICE, 'USDT', orderId)).toBe('200');
      expect(await held(ALICE, 'USDT')).toBe('200');

      // Recovery: cancel. Engine answers not-live; hold comes back once.
      await service.cancelOrder(principalFor(ALICE), orderId);
      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  describe('chaos F5 — trade die after engine accept; consumer settles once', () => {
    it('recovery settleFillEvent after offline match settles once (no double settle)', async () => {
      // Both rest with no inline fills (engine "matched while trade was dead").
      await fund(BOB, 'BTC', '5');
      await fund(ALICE, 'USDT', '1000');
      const maker = await rest(BOB, btcusdt, 'sell', '2', '100', 'bob-f5');
      const taker = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-f5');
      expect(maker.status).toBe('open');
      expect(taker.status).toBe('open');

      const sequence = 77_001;
      for (let i = 0; i < 4; i++) {
        await trade.settleFillEvent({
          marketId: btcusdt.id,
          makerOrderId: maker.id,
          takerOrderId: taker.id,
          price: '100',
          qty: '2',
          sequence,
        });
      }

      expect(postsWithReason('trade.fill')).toHaveLength(1);
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(await held(BOB, 'BTC')).toBe('0');
      expect(ledger.totalsByAsset()).toEqual({ BTC: '0', USDT: '0' });
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  describe('chaos F6 — matching restart / journal replay no double settle', () => {
    it('journal-style redelivery of fill + cancel never double-settles or double-releases', async () => {
      await fund(BOB, 'BTC', '10');
      await fund(ALICE, 'USDT', '2000');
      const maker = await rest(BOB, btcusdt, 'sell', '10', '100', 'bob-f6');
      matching.scriptFills([{ makerOrderId: maker.id, makerAccountId: BOB, price: '100', qty: '4' }], { restRemainder: '6' });
      const partial = await rest(ALICE, btcusdt, 'buy', '10', '100', 'alice-f6');

      const sequence = (await sql<Array<{ sequence: number }>>`SELECT sequence FROM trade.fills LIMIT 1`)[0]!.sequence;

      // Matching "restarted" and re-emitted the journal: fills + cancel.
      for (let i = 0; i < 3; i++) {
        await trade.settleFillEvent({
          marketId: btcusdt.id,
          makerOrderId: maker.id,
          takerOrderId: partial.id,
          price: '100',
          qty: '4',
          sequence,
        });
      }
      await trade.cancelOrder(principalFor(ALICE), partial.id);
      await trade.releaseOnCancelEvent(partial.id);
      await trade.releaseOnCancelEvent(partial.id);

      expect(postsWithReason('trade.fill')).toHaveLength(1);
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
      expect(ledger.totalsByAsset().USDT).toBe('0');
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });

  describe('chaos F7 — kill-switch place refuse + cancel still ok', () => {
    it('spot kill-switch refuses new places; cancel of open order still releases hold', async () => {
      await fund(ALICE, 'USDT', '1000');
      const open = await rest(ALICE, btcusdt, 'buy', '2', '100', 'alice-f7-open');
      expect(open.status).toBe('open');
      expect(await held(ALICE, 'USDT')).toBe('200');

      const killed = new TradeService(sql, ledger, matching, perks, bus, { spotEnabled: false });

      await expect(
        killed.placeOrder(principalFor(ALICE), {
          marketId: btcusdt.id,
          side: 'buy',
          type: 'limit',
          qty: amt('1'),
          price: amt('100'),
          clientOrderId: 'alice-f7-blocked',
        }),
      ).rejects.toMatchObject({ code: 'trade.spot_disabled' });

      // Cancel still works — kill-switch must not trap funds.
      await killed.cancelOrder(principalFor(ALICE), open.id);
      expect(await avail(ALICE, 'USDT')).toBe('1000');
      expect(await held(ALICE, 'USDT')).toBe('0');
      expect(postsWithReason('order.hold.released')).toHaveLength(1);
      expect(ledger.totalsByAsset().USDT).toBe('0');
    });
  });
}
