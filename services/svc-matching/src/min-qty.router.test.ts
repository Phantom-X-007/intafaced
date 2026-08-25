import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for min qty. A fill below the floor does not occur.
 * Missing or zero is not set. No invented default.
 */

const SECRET = 'matching-min-qty-router-secret-32char';
const MARKET = 'BTC-USDT';

function proofFor() {
  const observedAt = '2026-08-25T16:00:00.000Z';
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
    qty: '10',
    price: '100',
    tif: 'GTC' as const,
    minQty: '5',
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

describe('POST /markets/:marketId/orders min qty', () => {
  it('rests with minQty — a smaller opposite does not fill below the floor', async () => {
    const { app, engine } = await mount();
    const ask = await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '2',
        minQty: undefined,
      }),
    );
    expect(ask.statusCode).toBe(200);
    expect(ask.json().accepted).toBe(true);

    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills).toEqual([]);
    expect(res.json().resting.remaining).toBe('10');
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.remaining).toBe('2');
    expect(engine.book(MARKET).toState().bids[0]!.orders[0]!.minQty).toBe('5');
    await app.close();
  });

  it('fills when every clip meets the floor', async () => {
    const { app } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '10',
        minQty: undefined,
      }),
    );
    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills).toHaveLength(1);
    expect(res.json().fills[0].qty).toBe('10');
    expect(res.json().resting).toBeNull();
    await app.close();
  });

  it('missing minQty is a normal order — no invented default', async () => {
    const { app } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '2',
        minQty: undefined,
      }),
    );
    const res = await post(app, submitBody({ minQty: undefined, qty: '10' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills[0].qty).toBe('2');
    await app.close();
  });

  it('minQty above remaining refuses — no invented fill', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ qty: '2', minQty: '5' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('min_qty_exceeds_qty');
    expect(res.json().fills).toEqual([]);
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    await app.close();
  });
});
