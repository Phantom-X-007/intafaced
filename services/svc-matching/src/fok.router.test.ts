import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for FOK. Fill completely or cancel the whole.
 * No partial leftover. No invented fill.
 */

const SECRET = 'matching-fok-router-secret-32charsxx';
const MARKET = 'BTC-USDT';

function proofFor() {
  const observedAt = '2026-08-24T16:00:00.000Z';
  return createMarketLifecycleAdmissionProof(
    {
      marketId: MARKET,
      ruleVersion: 'test.rules.v1',
      instrumentId: MARKET,
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

function submitBody(over: Record<string, unknown> = {}) {
  return {
    orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    accountId: 'desk',
    type: 'limit' as const,
    side: 'buy' as const,
    qty: '3',
    price: '100',
    tif: 'FOK' as const,
    lifecycleProof: proofFor(),
    ...over,
  };
}

async function mount(): Promise<{ app: FastifyInstance; engine: MatchingEngine }> {
  const engine = new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return { app, engine };
}

function post(app: FastifyInstance, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url: `/markets/${MARKET}/orders`,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

describe('POST /markets/:marketId/orders FOK', () => {
  it('fills completely through the door', async () => {
    const { app, engine } = await mount();
    const ask = await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '3',
        price: '100',
        tif: 'GTC',
      }),
    );
    expect(ask.statusCode).toBe(200);
    expect(ask.json().accepted).toBe(true);

    const res = await post(
      app,
      submitBody({
        orderId: '22222222-2222-4222-8222-222222222222',
        qty: '3',
        price: '100',
        tif: 'FOK',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills).toHaveLength(1);
    expect(res.json().fills[0].qty).toBe('3');
    expect(res.json().resting).toBeNull();
    const live = engine.book(MARKET).toState();
    const ids = [
      ...live.bids.flatMap((l) => l.orders.map((o) => o.orderId)),
      ...live.asks.flatMap((l) => l.orders.map((o) => o.orderId)),
    ];
    expect(ids).not.toContain('22222222-2222-4222-8222-222222222222');
    await app.close();
  });

  it('short book refuses the whole — no invented fill', async () => {
    const { app, engine } = await mount();
    const ask = await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '1',
        price: '100',
        tif: 'GTC',
      }),
    );
    expect(ask.statusCode).toBe(200);

    const res = await post(
      app,
      submitBody({
        orderId: '33333333-3333-4333-8333-333333333333',
        qty: '3',
        price: '100',
        tif: 'FOK',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('fok_unfillable');
    expect(res.json().fills).toEqual([]);
    expect(res.json().resting).toBeNull();
    const live = engine.book(MARKET).toState();
    expect(live.asks[0].orders[0].orderId).toBe('11111111-1111-4111-8111-111111111111');
    expect(live.asks[0].orders[0].remaining).toBe('1');
    await app.close();
  });

  it('empty-book FOK does not invent a fill', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('fok_unfillable');
    expect(res.json().fills).toEqual([]);
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    expect(engine.book(MARKET).toState().asks).toEqual([]);
    await app.close();
  });
});
