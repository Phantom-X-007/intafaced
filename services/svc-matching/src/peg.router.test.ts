import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for peg / relative.
 * Executes at caller reference + offset. Missing those refuses. No invented mid.
 */

const SECRET = 'matching-peg-router-secret-32charsxx';
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

describe('POST /markets/:marketId/orders peg / relative', () => {
  it('missing flags are a normal order — no invented reference', async () => {
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

  it('peg:true without reference + offset refuses — no rest as a limit', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ peg: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_reference');
    expect(res.json().fills).toEqual([]);
    expect(res.json().resting).toBeNull();
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    await app.close();
  });

  it('peg:true with reference + offset takes at that price', async () => {
    const { app } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        side: 'sell',
        qty: '2',
        price: '101',
      }),
    );
    const res = await post(app, submitBody({ peg: true, reference: '100', offset: '1', qty: '10' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills[0].qty).toBe('2');
    expect(res.json().fills[0].price).toBe('101');
    expect(res.json().resting.price).toBe('101');
    await app.close();
  });

  it('relative:true with a signed offset rests at reference + offset', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ relative: true, reference: '100', offset: '-1', qty: '3' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills).toEqual([]);
    expect(res.json().resting.price).toBe('99');
    expect(engine.book(MARKET).toState().bids[0]?.price).toBe('99');
    await app.close();
  });

  it('midpoint:true refuses — no invented mid', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ midpoint: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('midpoint_unsupported');
    expect(res.json().fills).toEqual([]);
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    await app.close();
  });

  it('relative:true without offset refuses', async () => {
    const { app } = await mount();
    const res = await post(app, submitBody({ relative: true, reference: '100' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_offset');
    await app.close();
  });
});
