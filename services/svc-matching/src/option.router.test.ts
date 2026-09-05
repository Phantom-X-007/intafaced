/**
 * HTTP door for an option. Rest as a limit on the public book.
 * Refuse if strike or expiry is missing. No invented mark.
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-option-router-secret-32chxxxx';
const MARKET = 'BTC-USDT';
const EXPIRY = '2026-12-31T00:00:00.000Z';

function proofFor() {
  const observedAt = '2026-08-31T12:00:00.000Z';
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
    qty: '2',
    price: '99',
    tif: 'GTC' as const,
    strike: '100',
    expiry: EXPIRY,
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

describe('POST /markets/:marketId/orders option', () => {
  it('200 accepted rests on the public book', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().resting.kind).toBe('book');
    expect(engine.depth(MARKET, 50)!.bids).toEqual([['99', '2']]);
    await app.close();
  });

  it('missing strike refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ strike: null }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_strike');
    expect(engine.depth(MARKET, 50)?.bids ?? []).toEqual([]);
    await app.close();
  });

  it('missing expiry refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ expiry: null }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_expiry');
    expect(engine.depth(MARKET, 50)?.bids ?? []).toEqual([]);
    await app.close();
  });

  it('omitted mark is fine — do not require a mark', async () => {
    const { app, engine } = await mount();
    const body = submitBody();
    expect('mark' in body).toBe(false);
    const res = await post(app, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(engine.depth(MARKET, 50)!.bids).toEqual([['99', '2']]);
    await app.close();
  });
});
