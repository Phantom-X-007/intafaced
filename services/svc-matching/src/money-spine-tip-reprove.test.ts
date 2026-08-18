/**
 * D26-P2-12 — tip re-prove of the matching money doors.
 *
 * D26-P2-01d already promise-falsified cancel / phantom / determinism. This
 * suite re-proves the spine edges that couple the engine door to ledger honesty
 * on tip: reconcile must stay read-only after a real fill+cancel stream, and a
 * funded counterpart view that the engine never saw must refuse without invent
 * or repair. Softening reconcile into a mute repair, or letting a miss allocate
 * a market, fails here while unit-only guards could stay green.
 *
 * Class: N (honesty). Leverage: registerRoutes + MatchingEngine + MemoryJournal
 * (Phase A in-repo shell — no second book).
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-money-spine-tip-reprove-secret-32c';
const MARKET = 'BTC-USDT';

function fixedClock(): () => Date {
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.UTC(2026, 7, 12) + tick * 1000);
  };
}

function buildEngine(): MatchingEngine {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    clock: fixedClock(),
    snapshotEvery: 0,
  });
}

async function mount(engine: MatchingEngine): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return app;
}

function limitBody(orderId: string, accountId: string, side: 'buy' | 'sell', qty: string, price: string) {
  return {
    orderId,
    accountId,
    type: 'limit' as const,
    side,
    qty,
    price,
    tif: 'GTC' as const,
  };
}

async function submit(
  app: FastifyInstance,
  marketId: string,
  body: ReturnType<typeof limitBody>,
): Promise<ReturnType<FastifyInstance['inject']>> {
  const payload = JSON.stringify(body);
  return app.inject({
    method: 'POST',
    url: `/markets/${marketId}/orders`,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

async function cancel(app: FastifyInstance, marketId: string, orderId: string) {
  return app.inject({
    method: 'DELETE',
    url: `/markets/${marketId}/orders/${orderId}`,
    headers: serviceAuthHeadersForBody('svc-trade', SECRET, ''),
  });
}

async function reconcile(app: FastifyInstance, orders: unknown[]) {
  const payload = JSON.stringify({ orders });
  return app.inject({
    method: 'POST',
    url: '/reconcile',
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

describe('D26-P2-12 tip re-prove — matching money doors', () => {
  it('fill + cancel through the door then reconcile clean leaves the book untouched', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const maker = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const taker = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const rest = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    expect((await submit(app, MARKET, limitBody(maker, 'acct-maker', 'sell', '5', '100'))).statusCode).toBe(200);
    const fill = await submit(app, MARKET, limitBody(taker, 'acct-taker', 'buy', '2', '100'));
    expect(fill.statusCode).toBe(200);
    expect(fill.json()).toMatchObject({
      accepted: true,
      fills: [{ qty: '2', price: '100' }],
    });
    expect((await submit(app, MARKET, limitBody(rest, 'acct-rest', 'buy', '1', '99'))).statusCode).toBe(200);

    const before = engine.serialize();
    const clean = await reconcile(app, [
      {
        orderId: maker,
        marketId: MARKET,
        state: 'open',
        remaining: '3',
        funded: true,
        detail: 'hold=3 BTC',
      },
      {
        orderId: rest,
        marketId: MARKET,
        state: 'open',
        remaining: '1',
        funded: true,
        detail: 'hold=99 USDT',
      },
    ]);

    expect(clean.statusCode).toBe(200);
    expect(clean.json()).toMatchObject({ ok: true, agreed: 2, refusals: 0 });
    expect(engine.serialize()).toBe(before);

    await app.close();
  });

  it('funded open on the counterpart with no engine row refuses without invent or cancel', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghostOrder = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const ghostMarket = 'NEVER-TRADED-SPINE-REPROVE';

    const before = engine.serialize();
    const res = await reconcile(app, [
      {
        orderId: ghostOrder,
        marketId: ghostMarket,
        state: 'open',
        remaining: '2',
        funded: true,
        detail: 'hold=200 USDT',
      },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, refusals: 1 });
    expect(res.json().findings[0]).toMatchObject({
      case: 'counterpart_open_engine_missing',
      orderId: ghostOrder,
    });
    expect(String(res.json().findings[0].counterpart)).toContain('hold=200 USDT');
    expect(engine.hasMarket(ghostMarket)).toBe(false);
    expect(engine.serialize()).toBe(before);
    expect(engine.markets).toEqual([]);

    await app.close();
  });

  it('after cancel through the door, a still-funded counterpart open refuses as missing', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const orderId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await submit(app, MARKET, limitBody(orderId, 'acct-1', 'buy', '1', '100'));
    expect((await cancel(app, MARKET, orderId)).statusCode).toBe(200);
    // Cancel empties the book but keeps the traded market id — reconcile must
    // still refuse a funded open that is no longer live, without inventing a
    // second market or resurrecting the order.
    const before = engine.serialize();
    expect(JSON.parse(before)).toEqual([expect.objectContaining({ marketId: MARKET, bids: [], asks: [], stops: [] })]);

    const res = await reconcile(app, [
      {
        orderId,
        marketId: MARKET,
        state: 'open',
        remaining: '1',
        funded: true,
        detail: 'hold=100 USDT stranded',
      },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false, refusals: 1 });
    expect(res.json().findings[0].case).toBe('counterpart_open_engine_missing');
    expect(engine.serialize()).toBe(before);
    expect(engine.markets).toEqual([MARKET]);

    await app.close();
  });

  it('unauthenticated reconcile never reaches the engine and allocates nothing', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'UNAUTH-RECONCILE-GHOST';

    const res = await app.inject({
      method: 'POST',
      url: '/reconcile',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        orders: [
          {
            orderId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            marketId: ghost,
            state: 'open',
            remaining: '1',
            funded: true,
          },
        ],
      }),
    });

    expect(res.statusCode).toBe(401);
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.markets).toEqual([]);
    await app.close();
  });
});
