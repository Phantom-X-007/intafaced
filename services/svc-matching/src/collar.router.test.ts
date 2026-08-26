import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for price collar.
 * Caller min/max. Submit outside the band refuses. Missing band refuses. No invented last or mid.
 */

const SECRET = 'matching-collar-router-secret-32chars';
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

describe('POST /markets/:marketId/orders price collar', () => {
  it('missing flags are a normal order — no invented band', async () => {
    const { app } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '2',
      }),
    );
    const res = await post(app, submitBody({ qty: '10' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills[0].qty).toBe('2');
    await app.close();
  });

  it('collar:true without min/max refuses — last/mid on the book are not a band', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'buy',
        qty: '1',
        price: '99',
      }),
    );
    await post(
      app,
      submitBody({
        orderId: '22222222-2222-4222-8222-222222222222',
        accountId: 'mm',
        side: 'sell',
        qty: '1',
        price: '101',
      }),
    );
    const res = await post(app, submitBody({ collar: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_collar');
    expect(res.json().fills).toEqual([]);
    expect(res.json().resting).toBeNull();
    expect(engine.book(MARKET).toState().bids).toHaveLength(1);
    expect(engine.book(MARKET).toState().asks).toHaveLength(1);
    await app.close();
  });

  it('submit below min refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ collar: true, min: '90', max: '110', price: '80' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('outside_collar');
    expect(res.json().fills).toEqual([]);
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    await app.close();
  });

  it('submit above max refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ collar: true, min: '90', max: '110', price: '120', side: 'sell' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('outside_collar');
    expect(engine.book(MARKET).toState().asks).toEqual([]);
    await app.close();
  });

  it('collar:true with min/max inside the band takes', async () => {
    const { app } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '2',
        price: '100',
      }),
    );
    const res = await post(app, submitBody({ collar: true, min: '90', max: '110', qty: '10' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills[0].qty).toBe('2');
    await app.close();
  });
});
