import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for stop-limit. Off the book until the stop prints.
 * No invented trigger.
 */

const SECRET = 'matching-stop-limit-router-secret-32ch';
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
    type: 'stop_limit' as const,
    side: 'buy' as const,
    qty: '2',
    price: '106',
    stopPx: '105',
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

describe('POST /markets/:marketId/orders stop-limit', () => {
  it('rests off the book — only the stop book holds it', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().resting.kind).toBe('stop');
    expect(engine.depth(MARKET, 50)!.bids).toEqual([]);
    expect(engine.book(MARKET).toState().stops[0]!.stopPrice).toBe('105');
    await app.close();
  });

  it('a print that reaches stopPx puts the leftover on the book', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'mm',
        type: 'limit',
        side: 'sell',
        qty: '2',
        price: '100',
        stopPx: undefined,
      }),
    );
    await post(
      app,
      submitBody({
        orderId: '22222222-2222-4222-8222-222222222222',
        accountId: 'warm',
        type: 'market',
        side: 'buy',
        qty: '2',
        price: undefined,
        stopPx: undefined,
      }),
    );
    await post(
      app,
      submitBody({
        orderId: '33333333-3333-4333-8333-333333333333',
        accountId: 'mm',
        type: 'limit',
        side: 'sell',
        qty: '10',
        price: '106',
        stopPx: undefined,
      }),
    );
    await post(app, submitBody({ orderId: '44444444-4444-4444-8444-444444444444' }));
    const trigger = await post(
      app,
      submitBody({
        orderId: '55555555-5555-4555-8555-555555555555',
        accountId: 'taker',
        type: 'market',
        side: 'buy',
        qty: '1',
        price: undefined,
        stopPx: undefined,
      }),
    );
    expect(trigger.statusCode).toBe(200);
    expect(trigger.json().triggered[0].orderId).toBe('44444444-4444-4444-8444-444444444444');
    expect(engine.book(MARKET).toState().stops).toHaveLength(0);
    await app.close();
  });

  it('missing stopPx refuses — no invented trigger', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ stopPx: undefined, stopPrice: undefined }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_stop_price');
    expect(engine.depth(MARKET, 50)?.bids ?? []).toEqual([]);
    await app.close();
  });
});
