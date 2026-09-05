import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { installL3Queue, L3_UNAVAILABLE, L4_UNPUBLISHED, MAKER_IDENTITY_UNPUBLISHED } from './engine/l3-queue.js';
import { registerRoutes } from './router.js';
import { userCopy } from './user-copy.js';

/**
 * H2 matching HTTP: native L3/queue door.
 * GET /markets/:id/depth/l3 reads engine.l3Queue().
 * GET /depth stays L2 tuples. Never synthesize L3 from L2.
 */

installL3Queue();

const SECRET = 'matching-l3-router-secret-32chars!!';
const MARKET = 'BTC-USDT';
const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';

function proofFor(marketId: string) {
  const observedAt = '2026-08-25T16:00:00.000Z';
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
    'PLACE',
  );
}

function submitBody(orderId: string, accountId: string, side: 'buy' | 'sell', qty: string, price: string) {
  return {
    orderId,
    accountId,
    type: 'limit' as const,
    side,
    qty,
    price,
    tif: 'GTC' as const,
    lifecycleProof: proofFor(MARKET),
  };
}

async function mount(engine: MatchingEngine): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return app;
}

function buildEngine(): MatchingEngine {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
}

function post(app: FastifyInstance, url: string, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

function assertNoJsonNumbers(value: unknown, path = '$'): void {
  if (typeof value === 'number') {
    throw new Error(`money amount at ${path} left as JSON number ${value}`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoJsonNumbers(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'sequence') continue;
      assertNoJsonNumbers(v, `${path}.${k}`);
    }
  }
}

describe('H2 native L3 HTTP door', () => {
  it('GET /depth/l3 lists per-order queue from native l3Queue, not L2 size tuples', async () => {
    const engine = buildEngine();
    const app = await mount(engine);

    expect((await post(app, `/markets/${MARKET}/orders`, submitBody(FIRST, 'maker-a', 'sell', '1', '100'))).statusCode).toBe(200);
    expect((await post(app, `/markets/${MARKET}/orders`, submitBody(SECOND, 'maker-b', 'sell', '2', '100'))).statusCode).toBe(200);

    const l2 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
    expect(l2.statusCode).toBe(200);
    expect(l2.json().asks).toEqual([['100', '3']]);
    expect(l2.json().level).toBeUndefined();
    expect(l2.json()).not.toHaveProperty('orders');

    const l3 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3` });
    expect(l3.statusCode).toBe(200);
    const body = l3.json();
    expect(body.level).toBe('L3');
    expect(body.marketId).toBe(MARKET);
    expect(body.asks).toHaveLength(1);
    expect(body.asks[0].price).toBe('100');
    expect(body.asks[0].orders.map((row: { orderId: string }) => row.orderId)).toEqual([FIRST, SECOND]);
    expect(body.asks[0].orders[0].remaining).toBe('1');
    expect(body.asks[0].orders[1].remaining).toBe('2');
    expect(body.asks[0].orders[0].sequence).toBeLessThan(body.asks[0].orders[1].sequence);
    expect(body.asks).not.toEqual(l2.json().asks);
    expect(JSON.stringify(body)).not.toContain('maker-a');
    expect(JSON.stringify(body)).not.toContain('maker-b');
    expect(body.asks[0].orders[0]).not.toHaveProperty('accountId');
    expect(body.makerIdentity.accepted).toBe(false);
    expect(body.makerIdentity.rejected.code).toBe(MAKER_IDENTITY_UNPUBLISHED);
    expect(body.makerIdentity.identity).toBeNull();
    expect(body.l4.accepted).toBe(false);
    expect(body.l4.rejected.code).toBe(L4_UNPUBLISHED);
    expect(body.l4.level).toBeUndefined();
    assertNoJsonNumbers(body.asks);
    assertNoJsonNumbers(body.bids);

    await app.close();
  });

  it('GET /depth stays L2 even with format=l3', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    await post(app, `/markets/${MARKET}/orders`, submitBody(FIRST, 'maker-a', 'sell', '1', '100'));
    await post(app, `/markets/${MARKET}/orders`, submitBody(SECOND, 'maker-b', 'sell', '2', '100'));

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50&format=l3` });
    expect(res.statusCode).toBe(200);
    expect(res.json().asks).toEqual([['100', '3']]);
    expect(res.json().level).not.toBe('L3');
    expect(res.json().asks[0]).not.toHaveProperty('orders');

    await app.close();
  });

  it('never-traded market is 404 with no invented L3 levels', async () => {
    const engine = buildEngine();
    const app = await mount(engine);
    const ghost = 'NEVER-TRADED-L3';

    const res = await app.inject({ method: 'GET', url: `/markets/${ghost}/depth/l3` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MarketNotFound');
    expect(res.json().message).toBe(userCopy('matching.market_not_found'));
    expect(res.json().bids).toBeUndefined();
    expect(res.json().asks).toBeUndefined();
    expect(engine.hasMarket(ghost)).toBe(false);
    expect(engine.markets).toEqual([]);

    await app.close();
  });

  it('empty native queue is honest empty L3 — does not invent levels from L2 depth', async () => {
    const engine = {
      hasMarket: () => true,
      depth: () => ({ bids: [['100', '3']], asks: [['101', '4']] }),
      l3Queue: () => ({ level: 'L3', marketId: MARKET, bids: [], asks: [] }),
      markets: [MARKET],
    };
    const app = Fastify({ logger: false });
    registerRoutes(app, engine as never, SECRET, { bodyBind: 'require' });
    await app.ready();

    const l2 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
    expect(l2.json().bids).toEqual([['100', '3']]);

    const l3 = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3` });
    expect(l3.statusCode).toBe(200);
    expect(l3.json().level).toBe('L3');
    expect(l3.json().bids).toEqual([]);
    expect(l3.json().asks).toEqual([]);
    expect(l3.json().bids).not.toEqual(l2.json().bids);

    await app.close();
  });

  it('missing l3Queue hitch refuses l3_unavailable and does not copy L2 tuples', async () => {
    const engine = {
      hasMarket: () => true,
      depth: () => ({ bids: [['100', '3']], asks: [] }),
      markets: [MARKET],
    };
    const app = Fastify({ logger: false });
    registerRoutes(app, engine as never, SECRET, { bodyBind: 'require' });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth/l3` });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe(L3_UNAVAILABLE);
    expect(res.json().level).toBeNull();
    expect(res.json().bids).toEqual([]);
    expect(res.json().asks).toEqual([]);
    expect(res.json().bids).not.toEqual([['100', '3']]);

    await app.close();
  });
});
