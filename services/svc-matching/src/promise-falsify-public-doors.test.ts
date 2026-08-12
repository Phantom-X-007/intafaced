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
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

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

    const res = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth` });
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

    const depth = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth` });
    expect(depth.statusCode).toBe(404);
    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).not.toContain(ghost);
    await app.close();
  });

  it('repeated phantom probes across all three doors leave GET /markets empty', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    for (let i = 0; i < 40; i++) {
      const ghost = `PHANTOM-PROBE-${i}`;
      await app.inject({ method: 'GET', url: `/markets/${ghost}/depth` });
      await cancel(app, ghost, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      await orders(app, ghost);
    }

    expect(engine.markets).toHaveLength(0);
    const listed = await app.inject({ method: 'GET', url: '/markets' });
    expect(listed.json().markets).toEqual([]);
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
    async function drive(): Promise<{
      serialize: string;
      submitBodies: unknown[];
      cancelBodies: unknown[];
      depth: unknown;
      resting: unknown;
    }> {
      const engine = buildEngine();
      const app = await mount(engine);
      const submitBodies: unknown[] = [];
      const cancelBodies: unknown[] = [];

      const maker = '22222222-2222-4222-8222-222222222222';
      const takerPartial = '33333333-3333-4333-8333-333333333333';
      const restBuy = '44444444-4444-4444-8444-444444444444';
      const cancelMe = '55555555-5555-4555-8555-555555555555';

      submitBodies.push((await submit(app, MARKET, limitBody(maker, 'acct-maker', 'sell', '5', '100'))).json());
      submitBodies.push((await submit(app, MARKET, limitBody(takerPartial, 'acct-taker', 'buy', '2', '100'))).json());
      submitBodies.push((await submit(app, MARKET, limitBody(restBuy, 'acct-rest', 'buy', '1', '99'))).json());
      submitBodies.push((await submit(app, MARKET, limitBody(cancelMe, 'acct-gone', 'buy', '4', '98'))).json());
      cancelBodies.push((await cancel(app, MARKET, cancelMe)).json());

      // Cross-market noise that must still be deterministic.
      submitBodies.push(
        (await submit(app, OTHER, limitBody('66666666-6666-4666-8666-666666666666', 'acct-eth', 'buy', '1', '2000'))).json(),
      );

      const depth = (await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth` })).json();
      const resting = (await orders(app, MARKET)).json();
      const serialize = engine.serialize();
      await app.close();
      return { serialize, submitBodies, cancelBodies, depth, resting };
    }

    const a = await drive();
    const b = await drive();

    expect(a.serialize).toBe(b.serialize);
    expect(a.serialize.length).toBeGreaterThan(40);
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
    const liveDepth = (await liveApp.inject({ method: 'GET', url: `/markets/${MARKET}/depth` })).json();
    const recoveredDepth = (await recoveredApp.inject({ method: 'GET', url: `/markets/${MARKET}/depth` })).json();
    expect(recoveredDepth).toEqual(liveDepth);

    await liveApp.close();
    await recoveredApp.close();
  });
});
