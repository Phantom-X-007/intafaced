import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for post-only. Rest if it would not take. Refuse if it would.
 * No invented price.
 */

const SECRET = 'matching-post-only-router-secret-32c';
const MARKET = 'BTC-USDT';

function proofFor(action: 'PLACE' | 'PLACE_POST_ONLY') {
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
    action,
  );
}

function submitBody(over: Record<string, unknown> = {}) {
  return {
    orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    accountId: 'desk',
    type: 'limit' as const,
    side: 'buy' as const,
    qty: '1',
    price: '99',
    tif: 'PO' as const,
    lifecycleProof: proofFor('PLACE_POST_ONLY'),
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

describe('POST /markets/:marketId/orders post-only', () => {
  it('rests a post-only behind the spread through the door', async () => {
    const { app, engine } = await mount();
    const ask = await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        price: '100',
        tif: 'GTC',
        lifecycleProof: proofFor('PLACE'),
      }),
    );
    expect(ask.statusCode).toBe(200);
    expect(ask.json().accepted).toBe(true);

    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills).toEqual([]);
    expect(res.json().resting).toMatchObject({ kind: 'book', price: '99' });
    expect(engine.book(MARKET).toState().bids[0]!.orders[0]!.postOnly).toBe(true);
    await app.close();
  });

  it('refuses a post-only that would take', async () => {
    const { app } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        price: '100',
        tif: 'GTC',
        lifecycleProof: proofFor('PLACE'),
      }),
    );
    const res = await post(app, submitBody({ price: '100', orderId: '22222222-2222-4222-8222-222222222222' }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      accepted: false,
      rejected: { code: 'post_only_would_cross' },
    });
    expect(res.json().fills).toEqual([]);
    await app.close();
  });

  it('refuses a post-only market — the engine does not invent a price', async () => {
    const { app } = await mount();
    const res = await post(
      app,
      submitBody({
        type: 'market',
        price: null,
        tif: 'PO',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('invalid_tif');
    await app.close();
  });

  it('postOnly:true on GTC rests as post-only', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        price: '100',
        tif: 'GTC',
        lifecycleProof: proofFor('PLACE'),
      }),
    );
    const res = await post(
      app,
      submitBody({
        tif: 'GTC',
        postOnly: true,
        lifecycleProof: proofFor('PLACE_POST_ONLY'),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(engine.book(MARKET).toState().bids[0]!.orders[0]!.postOnly).toBe(true);
    await app.close();
  });
});
