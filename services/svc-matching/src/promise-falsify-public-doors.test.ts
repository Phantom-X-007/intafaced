/**
 * Unit card (D26-P2-01d):
 * Promise: cancel integrity, phantom-market refuse, and §5.4 determinism edges
 *   hold through mounted Fastify public doors — not engine-unit-only guards.
 * Break: cancel could invent markets / miss remaining qty / leave a second
 *   cancel green; depth·orders·cancel probes could grow phantom markets;
 *   two identical signed HTTP submit+cancel streams could diverge in
 *   response payloads or canonical serialize() state.
 * Done bar:
 *   · signed cancel cancels only the named live order; double-cancel → 404;
 *     wrong-market cancel → 404; cancellation carries remainingQty + sequence;
 *     market list does not grow from a miss.
 *   · GET /depth, DELETE cancel, GET /orders on a never-traded market refuse
 *     without allocating (GET /markets unchanged).
 *   · two engines fed the same signed HTTP submit+cancel stream produce
 *     byte-identical serialize() and matching door payloads.
 * Class: N (honesty). Leverage: registerRoutes + MatchingEngine + MemoryJournal
 *   (existing engine tests deepened to public doors).
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';
import { userCopy } from './user-copy.js';

const SECRET = 'matching-promise-falsify-public-doors-secret-32';
const MARKET = 'BTC-USDT';
const OTHER = 'ETH-USDT';

/** Deterministic clock so two door-fed engines journal the same timestamps. */
function fixedClock(): () => Date {
  let tick = 0;
  return () => {
    tick += 1;
    return new Date(Date.UTC(2026, 0, 1) + tick * 1000);
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

function lifecycleProof(marketId: string, action: 'PLACE' | 'PLACE_POST_ONLY' = 'PLACE') {
  const observedAt = '2026-08-24T16:00:00.000Z';
  return createMarketLifecycleAdmissionProof(
    {
      marketId,
      ruleVersion: 'test.rules.v1',
      instrumentId: marketId,
      instrumentVersion: 'test.instrument.v1',
      state: 'OPEN',
      reasonCategory: 'NORMAL',
      reasonCode: 'trade.lifecycle.ready',
      effectiveAt: observedAt,
      observedAt,
      lastGoodState: 'OPEN',
      allowedActions: ['PLACE', 'PLACE_POST_ONLY'],
      transitionId: 'test.transition',
      evidenceRefs: ['test.evidence'],
    },
    action,
  );
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
  const payload = JSON.stringify({
    ...body,
    lifecycleProof: lifecycleProof(marketId, (body as { tif?: string }).tif === 'PO' ? 'PLACE_POST_ONLY' : 'PLACE'),
  });
  return app.inject({
    method: 'POST',
    url: `/markets/${marketId}/orders`,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

async function cancel(app: FastifyInstance, marketId: string, orderId: string): Promise<ReturnType<FastifyInstance['inject']>> {
  return app.inject({
    method: 'DELETE',
    url: `/markets/${marketId}/orders/${orderId}`,
    headers: serviceAuthHeadersForBody('svc-trade', SECRET, ''),
  });
}

async function orders(app: FastifyInstance, marketId: string): Promise<ReturnType<FastifyInstance['inject']>> {
  return app.inject({
    method: 'GET',
    url: `/markets/${marketId}/orders`,
    headers: serviceAuthHeadersForBody('svc-trade', SECRET, ''),
  });
}

describe('D26-P2-01d public doors — cancel integrity', () => {
  it('cancels only the named live order and returns remainingQty + sequence', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const keep = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const kill = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    expect((await submit(app, MARKET, limitBody(keep, 'acct-keep', 'buy', '2', '100'))).statusCode).toBe(200);
    expect((await submit(app, MARKET, limitBody(kill, 'acct-kill', 'buy', '3.5', '99'))).statusCode).toBe(200);

    const res = await cancel(app, MARKET, kill);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      cancelled: true,
      orderId: kill,
      cancellation: {
        orderId: kill,
        accountId: 'acct-kill',
        remainingQty: '3.5',
        reason: 'requested',
      },
    });
    expect(typeof res.json().sequence).toBe('number');
    expect(res.json().cancellation.sequence).toBe(res.json().sequence);

    const live = await orders(app, MARKET);
    expect(live.statusCode).toBe(200);
    expect(live.json().orders.map((o: { orderId: string }) => o.orderId)).toEqual([keep]);

    await app.close();
  });

  it('double-cancel is 404 and leaves the other resting order untouched', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const keep = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const kill = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    await submit(app, MARKET, limitBody(keep, 'acct-a', 'buy', '1', '100'));
    await submit(app, MARKET, limitBody(kill, 'acct-b', 'buy', '1', '99'));

    expect((await cancel(app, MARKET, kill)).statusCode).toBe(200);
    const again = await cancel(app, MARKET, kill);
    expect(again.statusCode).toBe(404);
    expect(again.json().code).toBe('OrderNotFound');

    const live = await orders(app, MARKET);
    expect(live.json().orders).toHaveLength(1);
    expect(live.json().orders[0].orderId).toBe(keep);
    await app.close();
  });

  it('cancel aimed at the wrong market is 404 and does not invent that market', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const orderId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await submit(app, MARKET, limitBody(orderId, 'acct-1', 'buy', '1', '100'));
    const before = [...engine.markets];

    const res = await cancel(app, OTHER, orderId);
    expect(res.statusCode).toBe(404);
    expect(engine.hasMarket(OTHER)).toBe(false);
    expect(engine.markets).toEqual(before);

    // Still live on the real book — wrong-market cancel must not steal it.
    const live = await orders(app, MARKET);
    expect(live.json().orders.map((o: { orderId: string }) => o.orderId)).toEqual([orderId]);
    await app.close();
  });

  it('cancel after a partial fill reports leftover remainingQty, not the original size', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const maker = '12121212-1212-4121-8121-121212121212';
    const taker = '13131313-1313-4131-8131-131313131313';
    const sibling = '14141414-1414-4141-8141-141414141414';

    expect((await submit(app, MARKET, limitBody(maker, 'acct-maker', 'sell', '5', '100'))).statusCode).toBe(200);
    expect((await submit(app, MARKET, limitBody(sibling, 'acct-sib', 'sell', '1', '100'))).statusCode).toBe(200);
    const take = await submit(app, MARKET, limitBody(taker, 'acct-taker', 'buy', '2', '100'));
    expect(take.statusCode).toBe(200);
    expect(take.json()).toMatchObject({
      accepted: true,
      fills: [{ qty: '2', price: '100', makerOrderId: maker }],
    });

    const listedBefore = (await app.inject({ method: 'GET', url: '/markets' })).json().markets;
    const liveBefore = await orders(app, MARKET);
    expect(liveBefore.json().orders).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: maker, remaining: '3' })]));

    const res = await cancel(app, MARKET, maker);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      cancelled: true,
      orderId: maker,
      cancellation: { orderId: maker, remainingQty: '3', reason: 'requested' },
    });
    expect(res.json().cancellation.remainingQty).toBe(
      liveBefore.json().orders.find((o: { orderId: string }) => o.orderId === maker).remaining,
    );
    expect(res.json().cancellation.sequence).toBe(res.json().sequence);

    const again = await cancel(app, MARKET, maker);
    expect(again.statusCode).toBe(404);
    expect(again.json().code).toBe('OrderNotFound');

    const live = await orders(app, MARKET);
    expect(live.json().orders.map((o: { orderId: string }) => o.orderId)).toEqual([sibling]);
    const listedAfter = (await app.inject({ method: 'GET', url: '/markets' })).json().markets;
    expect(listedAfter).toEqual(listedBefore);
    expect(listedAfter).toEqual([MARKET]);
    await app.close();
  });

  it('unknown order id on a known market is 404 and does not steal the live book', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const liveId = '15151515-1515-4151-8151-151515151515';
    const ghostId = '16161616-1616-4161-8161-161616161616';

    await submit(app, MARKET, limitBody(liveId, 'acct-live', 'buy', '1', '100'));
    const before = engine.serialize();

    const res = await cancel(app, MARKET, ghostId);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('OrderNotFound');
    expect(engine.serialize()).toBe(before);

    const live = await orders(app, MARKET);
    expect(live.json().orders).toHaveLength(1);
    expect(live.json().orders[0].orderId).toBe(liveId);
    await app.close();
  });

  it('a fully filled taker cannot be cancelled while the leftover maker stays live', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const maker = '17171717-1717-4171-8171-171717171717';
    const taker = '18181818-1818-4181-8181-181818181818';

    await submit(app, MARKET, limitBody(maker, 'acct-maker', 'sell', '5', '50'));
    const take = await submit(app, MARKET, limitBody(taker, 'acct-taker', 'buy', '4', '50'));
    expect(take.json().accepted).toBe(true);
    expect(take.json().resting).toBeNull();

    const res = await cancel(app, MARKET, taker);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('OrderNotFound');

    const live = await orders(app, MARKET);
    expect(live.json().orders.map((o: { orderId: string; remaining: string }) => [o.orderId, o.remaining])).toEqual([[maker, '1']]);
    expect(engine.hasMarket(MARKET)).toBe(true);
    await app.close();
  });

  it('unauthenticated cancel never reaches the engine', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const orderId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await submit(app, MARKET, limitBody(orderId, 'acct-1', 'buy', '1', '100'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/markets/${MARKET}/orders/${orderId}`,
    });

    expect(res.statusCode).toBe(401);
    const live = await orders(app, MARKET);
    expect(live.json().orders).toHaveLength(1);
    await app.close();
  });
});

describe('D26-P2-01d public doors — phantom market refuse', () => {
  it('GET depth on a never-traded market is 404 and allocates nothing', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'NEVER-TRADED-DEPTH-DOOR';

    const res = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    expect(engine.hasMarket(ghost)).toBe(false);

    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).toEqual([]);
    await app.close();
  });

  it('DELETE cancel on a never-traded market is 404 and journals nothing', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'NEVER-TRADED-CANCEL-DOOR';

    const res = await cancel(app, ghost, '00000000-0000-4000-8000-deadbeef0001');
    expect(res.statusCode).toBe(404);
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.markets).toEqual([]);
    // No journal side-effect: a recovered engine from this process would still
    // have zero markets — serialize stays the empty canonical form.
    expect(engine.serialize()).toBe('[]');
    await app.close();
  });

  it('GET orders on a never-traded market is 404 without allocating', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'NEVER-TRADED-ORDERS-DOOR';

    const res = await orders(app, ghost);
    expect(res.statusCode).toBe(404);
    expect(engine.hasMarket(ghost)).toBe(false);
    await app.close();
  });

  it('FOK reject through the submit door does not leave a phantom market listed', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'NEVER-TRADED-FOK-DOOR';

    const body = {
      orderId: '11111111-1111-4111-8111-111111111111',
      accountId: 'acct-fok',
      type: 'limit' as const,
      side: 'buy' as const,
      qty: '1',
      price: '100',
      tif: 'FOK' as const,
      lifecycleProof: lifecycleProof(ghost),
    };
    const payload = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: `/markets/${ghost}/orders`,
      headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected?.code).toBe('fok_unfillable');
    expect(engine.hasMarket(ghost)).toBe(false);

    const depth = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` });
    expect(depth.statusCode).toBe(404);
    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).not.toContain(ghost);
    await app.close();
  });

  it('IOC into a virgin market through the submit door does not list the market', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'NEVER-TRADED-IOC-DOOR';

    const body = {
      orderId: '1b1b1b1b-1b1b-41b1-81b1-1b1b1b1b1b1b',
      accountId: 'acct-ioc',
      type: 'limit' as const,
      side: 'buy' as const,
      qty: '1',
      price: '100',
      tif: 'IOC' as const,
      lifecycleProof: lifecycleProof(ghost),
    };
    const payload = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: `/markets/${ghost}/orders`,
      headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().resting).toBeNull();
    expect(res.json().fills).toEqual([]);
    expect(res.json().cancellations).toEqual([expect.objectContaining({ remainingQty: '1', reason: 'ioc_remainder' })]);
    expect(engine.hasMarket(ghost)).toBe(false);

    const depth = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` });
    expect(depth.statusCode).toBe(404);
    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).not.toContain(ghost);
    expect(listed.json().markets).toEqual([]);
    await app.close();
  });

  it('repeated phantom probes across all three doors leave GET /markets empty', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    for (let i = 0; i < 40; i++) {
      const ghost = `PHANTOM-PROBE-${i}`;
      await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` });
      await cancel(app, ghost, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      await orders(app, ghost);
    }

    expect(engine.markets).toHaveLength(0);
    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).toEqual([]);
    await app.close();
  });

  it('ghost depth/orders/cancel do not allocate even when another market already exists', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const liveId = '19191919-1919-4191-8191-191919191919';
    await submit(app, MARKET, limitBody(liveId, 'acct-live', 'buy', '1', '100'));
    const ghost = 'NEVER-TRADED-BESIDE-LIVE';

    const depth = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` });
    const listedOrders = await orders(app, ghost);
    const cancelled = await cancel(app, ghost, '00000000-0000-4000-8000-deadbeef0002');

    expect(depth.statusCode).toBe(404);
    expect(listedOrders.statusCode).toBe(404);
    expect(cancelled.statusCode).toBe(404);
    expect(engine.hasMarket(ghost)).toBe(false);

    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).toEqual([MARKET]);
    expect((await orders(app, MARKET)).json().orders).toHaveLength(1);
    await app.close();
  });

  it('a market that traded then emptied still answers depth; a never-traded ghost stays 404', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const only = '1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a';
    await submit(app, MARKET, limitBody(only, 'acct-only', 'buy', '1', '100'));
    expect((await cancel(app, MARKET, only)).statusCode).toBe(200);

    expect(engine.hasMarket(MARKET)).toBe(true);
    const emptied = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
    expect(emptied.statusCode).toBe(200);
    expect(emptied.json()).toMatchObject({ marketId: MARKET, bids: [], asks: [] });

    const ghost = 'NEVER-TRADED-EMPTY-VS-GHOST';
    const missing = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('MarketNotFound');
    expect(engine.hasMarket(ghost)).toBe(false);

    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).toEqual([MARKET]);
    await app.close();
  });
});

describe('D26-P2-01d public doors — determinism edges', () => {
  /**
   * The same signed HTTP stream against two independent mounted engines must
   * yield byte-identical canonical state. Engine-unit §5.4 already covers
   * journal replay; this pins the public door as a deterministic input path.
   */
  it('two door-fed engines produce byte-identical serialize() and matching payloads', async () => {
    type RestingDoor = { marketId: string; orders: Array<{ orderId: string; remaining: string }> };

    async function drive(): Promise<{
      serialize: string;
      submitBodies: unknown[];
      cancelBodies: unknown[];
      submitPayloads: string[];
      cancelPayloads: string[];
      depthPayload: string;
      ordersPayload: string;
      depth: unknown;
      resting: RestingDoor;
    }> {
      const engine = buildEngine();
      const app = await mount(engine);
      const submitBodies: unknown[] = [];
      const cancelBodies: unknown[] = [];
      const submitPayloads: string[] = [];
      const cancelPayloads: string[] = [];

      const maker = '22222222-2222-4222-8222-222222222222';
      const takerPartial = '33333333-3333-4333-8333-333333333333';
      const restBuy = '44444444-4444-4444-8444-444444444444';
      const cancelMe = '55555555-5555-4555-8555-555555555555';

      const recordSubmit = async (marketId: string, body: ReturnType<typeof limitBody>) => {
        const res = await submit(app, marketId, body);
        submitBodies.push(res.json());
        submitPayloads.push(res.payload);
        return res;
      };

      await recordSubmit(MARKET, limitBody(maker, 'acct-maker', 'sell', '5', '100'));
      await recordSubmit(MARKET, limitBody(takerPartial, 'acct-taker', 'buy', '2', '100'));
      await recordSubmit(MARKET, limitBody(restBuy, 'acct-rest', 'buy', '1', '99'));
      await recordSubmit(MARKET, limitBody(cancelMe, 'acct-gone', 'buy', '4', '98'));
      const cancelRes = await cancel(app, MARKET, cancelMe);
      cancelBodies.push(cancelRes.json());
      cancelPayloads.push(cancelRes.payload);

      // Cross-market noise that must still be deterministic.
      await recordSubmit(OTHER, limitBody('66666666-6666-4666-8666-666666666666', 'acct-eth', 'buy', '1', '2000'));

      const depthRes = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
      const ordersRes = await orders(app, MARKET);
      const depth = depthRes.json();
      const restingBody = ordersRes.json();
      // Narrow the door payload before returning so callers can read `.orders`
      // without treating the whole response as `unknown` (test-typecheck).
      expect(restingBody).toMatchObject({ marketId: MARKET, orders: expect.any(Array) });
      const resting = restingBody as RestingDoor;
      const serialize = engine.serialize();
      await app.close();
      return {
        serialize,
        submitBodies,
        cancelBodies,
        submitPayloads,
        cancelPayloads,
        depthPayload: depthRes.payload,
        ordersPayload: ordersRes.payload,
        depth,
        resting,
      };
    }

    const a = await drive();
    const b = await drive();

    expect(a.serialize).toBe(b.serialize);
    expect(Buffer.from(a.serialize, 'utf8').equals(Buffer.from(b.serialize, 'utf8'))).toBe(true);
    expect(a.serialize.length).toBeGreaterThan(40);
    expect(a.submitPayloads).toEqual(b.submitPayloads);
    expect(a.cancelPayloads).toEqual(b.cancelPayloads);
    expect(a.depthPayload).toBe(b.depthPayload);
    expect(a.ordersPayload).toBe(b.ordersPayload);
    expect(a.submitBodies).toEqual(b.submitBodies);
    expect(a.cancelBodies).toEqual(b.cancelBodies);
    expect(a.depth).toEqual(b.depth);
    expect(a.resting).toEqual(b.resting);

    // Guard: the stream actually filled and left resting depth — empty books
    // comparing equal would not prove the door path.
    expect(a.submitBodies[1]).toMatchObject({
      accepted: true,
      fills: [{ qty: '2', price: '100' }],
    });
    expect(a.cancelBodies[0]).toMatchObject({ cancelled: true, orderId: '55555555-5555-4555-8555-555555555555' });
    expect(a.resting).toMatchObject({
      marketId: MARKET,
      orders: expect.arrayContaining([
        expect.objectContaining({ orderId: '22222222-2222-4222-8222-222222222222', remaining: '3' }),
        expect.objectContaining({ orderId: '44444444-4444-4444-8444-444444444444' }),
      ]),
    });
    expect(a.resting.orders).toHaveLength(2);
  });

  it('replay of the journal recorded through the HTTP door reconstructs serialize()', async () => {
    const journal = new MemoryJournal();
    const engine = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      clock: fixedClock(),
      snapshotEvery: 0,
    });
    const app = await mount(engine);

    const a = '77777777-7777-4777-8777-777777777777';
    const b = '88888888-8888-4888-8888-888888888888';
    await submit(app, MARKET, limitBody(a, 'acct-a', 'sell', '3', '50'));
    await submit(app, MARKET, limitBody(b, 'acct-b', 'buy', '1', '50'));
    await cancel(app, MARKET, a);

    const live = engine.serialize();
    expect(journal.read().length).toBeGreaterThanOrEqual(3);

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching-recovery'),
      clock: fixedClock(),
      snapshotEvery: 0,
    });
    recovered.recover();
    expect(recovered.serialize()).toBe(live);

    // Public depth door on the recovered engine matches the live door answer.
    const liveApp = app;
    const recoveredApp = await mount(recovered);
    const liveDepth = (await liveApp.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` })).json();
    const recoveredDepth = (await recoveredApp.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` })).json();
    expect(recoveredDepth).toEqual(liveDepth);

    await liveApp.close();
    await recoveredApp.close();
  });

  it('boot recover of an IOC-only journal does not list a phantom on GET /markets', async () => {
    const journal = new MemoryJournal();
    const live = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      clock: fixedClock(),
      snapshotEvery: 0,
    });
    const app = await mount(live);
    const ghost = 'NEVER-TRADED-IOC-REPLAY-DOOR';
    const body = {
      orderId: '1c1c1c1c-1c1c-41c1-81c1-1c1c1c1c1c1c',
      accountId: 'acct-ioc-replay',
      type: 'limit' as const,
      side: 'buy' as const,
      qty: '2',
      price: '100',
      tif: 'IOC' as const,
      lifecycleProof: lifecycleProof(ghost),
    };
    const payload = JSON.stringify(body);
    const submitRes = await app.inject({
      method: 'POST',
      url: `/markets/${ghost}/orders`,
      headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
      payload,
    });
    expect(submitRes.json().accepted).toBe(true);
    expect(journal.read()).toHaveLength(1);
    await app.close();

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching-recovery'),
      clock: fixedClock(),
      snapshotEvery: 0,
    });
    recovered.recover();
    const recoveredApp = await mount(recovered);
    const listed = await recoveredApp.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).not.toContain(ghost);
    expect(listed.json().markets).toEqual([]);
    expect((await recoveredApp.inject({ method: 'GET', url: `/markets/${ghost}/depth?limit=50` })).statusCode).toBe(404);
    await recoveredApp.close();
  });

  it('boot recover of a cancel-only journal does not list a phantom on GET /markets', async () => {
    const journal = new MemoryJournal();
    journal.append({
      kind: 'cancel',
      marketId: 'LEGACY-CANCEL-PUBLIC-DOOR',
      at: '2026-01-01T00:00:00.000Z',
      orderId: '00000000-0000-4000-8000-cafebabe0099',
    });
    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching-recovery'),
      clock: fixedClock(),
      snapshotEvery: 0,
    });
    recovered.recover();
    const recoveredApp = await mount(recovered);
    const listed = await recoveredApp.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).toEqual([]);
    expect((await recoveredApp.inject({ method: 'GET', url: '/markets/LEGACY-CANCEL-PUBLIC-DOOR/depth?limit=50' })).statusCode).toBe(404);
    await recoveredApp.close();
  });
});

describe('promise-falsify public doors — D26-P2-12 spine reprove (phantom / unauth)', () => {
  const ghost = 'NEVER-TRADED-SPINE-REPROVE-PF';
  const ghostOrder = '12121212-1212-4121-8121-121212121212';

  function ghostLimitBody() {
    return limitBody(ghostOrder, 'acct-spine', 'buy', '1', '100');
  }

  async function unauthSubmit(app: FastifyInstance, marketId: string, body = ghostLimitBody()) {
    return app.inject({
      method: 'POST',
      url: `/markets/${marketId}/orders`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });
  }

  async function unauthOrders(app: FastifyInstance, marketId: string) {
    return app.inject({ method: 'GET', url: `/markets/${marketId}/orders` });
  }

  async function unauthReconcile(app: FastifyInstance, orders: unknown[]) {
    return app.inject({
      method: 'POST',
      url: '/reconcile',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ orders }),
    });
  }

  it('unauthenticated submit on a never-traded market is 401 and allocates nothing', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const before = engine.serialize();

    const res = await unauthSubmit(app, ghost);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'Unauthenticated', message: userCopy('matching.unauthenticated') });
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.serialize()).toBe(before);
    expect((await app.inject({ method: 'GET', url: '/markets' })).json().markets).toEqual([]);

    await app.close();
  });

  it('unauthenticated submit on a live market is 401 and leaves the resting book untouched', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const liveId = '13131313-1313-4131-8131-131313131313';
    await submit(app, MARKET, limitBody(liveId, 'acct-live', 'buy', '1', '100'));
    const before = engine.serialize();

    const res = await unauthSubmit(app, MARKET, limitBody('14141414-1414-4141-8141-141414141414', 'acct-attack', 'sell', '1', '100'));
    expect(res.statusCode).toBe(401);
    expect(engine.serialize()).toBe(before);
    expect((await orders(app, MARKET)).json().orders).toHaveLength(1);

    await app.close();
  });

  it('unauthenticated orders read on a ghost market is 401 — never allocates to answer 404', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const res = await unauthOrders(app, ghost);
    expect(res.statusCode).toBe(401);
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.markets).toEqual([]);

    await app.close();
  });

  it('forged service credentials on submit refuse before the engine and leave GET /markets empty', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const payload = JSON.stringify(ghostLimitBody());

    const res = await app.inject({
      method: 'POST',
      url: `/markets/${ghost}/orders`,
      headers: {
        'content-type': 'application/json',
        'x-intafaced-service': 'svc-trade',
        'x-intafaced-service-ts': String(Math.floor(Date.now() / 1000)),
        'x-intafaced-service-sig': 'a'.repeat(64),
      },
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(engine.hasMarket(ghost)).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/markets' })).json().markets).toEqual([]);
    await app.close();
  });

  it('cancel credentials lifted onto submit on a ghost market refuse with body-mismatch', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const payload = JSON.stringify(ghostLimitBody());

    const res = await app.inject({
      method: 'POST',
      url: `/markets/${ghost}/orders`,
      headers: {
        'content-type': 'application/json',
        ...serviceAuthHeadersForBody('svc-trade', SECRET, ''),
      },
      payload,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      code: 'Unauthenticated',
      rejected: 'body-mismatch',
      message: userCopy('matching.unauthenticated'),
    });
    expect(engine.hasMarket(ghost)).toBe(false);
    await app.close();
  });

  it('unauthenticated reconcile with a funded ghost open refuses before inventing the market', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const before = engine.serialize();

    const res = await unauthReconcile(app, [
      {
        orderId: ghostOrder,
        marketId: ghost,
        state: 'open',
        remaining: '1',
        funded: true,
        detail: 'hold=100 USDT',
      },
    ]);

    expect(res.statusCode).toBe(401);
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.serialize()).toBe(before);
    expect((await app.inject({ method: 'GET', url: '/markets' })).json().markets).toEqual([]);

    await app.close();
  });

  it('repeated unauthenticated write probes across submit, cancel, orders, and reconcile stay empty', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    for (let i = 0; i < 20; i++) {
      const probe = `PHANTOM-UNAUTH-${i}`;
      const orderId = `15151515-1515-4151-8151-${String(i).padStart(12, '0')}`;
      await unauthSubmit(app, probe, limitBody(orderId, 'acct-probe', 'buy', '1', '100'));
      await app.inject({ method: 'DELETE', url: `/markets/${probe}/orders/${orderId}` });
      await unauthOrders(app, probe);
      await unauthReconcile(app, [{ orderId, marketId: probe, state: 'open', remaining: '1', funded: true }]);
    }

    expect(engine.markets).toHaveLength(0);
    expect(engine.serialize()).toBe('[]');
    expect((await app.inject({ method: 'GET', url: '/markets' })).json().markets).toEqual([]);
    await app.close();
  });

  it('unauthenticated cancel on a ghost market is 401 and does not journal a phantom book', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    const res = await app.inject({
      method: 'DELETE',
      url: `/markets/${ghost}/orders/${ghostOrder}`,
    });

    expect(res.statusCode).toBe(401);
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.serialize()).toBe('[]');
    await app.close();
  });
});
