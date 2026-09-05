import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for iceberg. Only the display qty is visible.
 * Hidden remainder refills as display takes. No invented display.
 */

const SECRET = 'matching-iceberg-router-secret-32char';
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
    side: 'sell' as const,
    qty: '10',
    price: '100',
    tif: 'GTC' as const,
    displayQty: '2',
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

describe('POST /markets/:marketId/orders iceberg', () => {
  it('rests with only the display qty visible', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().resting.remaining).toBe('10');
    expect(engine.depth(MARKET, 50)!.asks).toEqual([['100', '2']]);
    const ice = engine.book(MARKET).toState().asks[0]!.orders[0]!;
    expect(ice.displayQty).toBe('2');
    expect(ice.remaining).toBe('10');
    await app.close();
  });

  it('a take larger than display does not invent hidden fills', async () => {
    const { app, engine } = await mount();
    await post(app, submitBody({ orderId: '11111111-1111-4111-8111-111111111111', accountId: 'mm' }));
    const take = await post(
      app,
      submitBody({
        orderId: '22222222-2222-4222-8222-222222222222',
        side: 'buy',
        qty: '8',
        displayQty: undefined,
        iceberg: undefined,
      }),
    );
    expect(take.statusCode).toBe(200);
    expect(take.json().accepted).toBe(true);
    expect(take.json().fills).toHaveLength(1);
    expect(take.json().fills[0].qty).toBe('2');
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.remaining).toBe('8');
    expect(engine.depth(MARKET, 50)!.asks[0]![1]).toBe('2');
    await app.close();
  });

  it('missing display refuses — no invented display', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ displayQty: undefined, iceberg: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('iceberg_display_missing');
    expect(engine.depth(MARKET, 50)!.asks).toEqual([]);
    await app.close();
  });

  it('display not smaller than total refuses', async () => {
    const { app } = await mount();
    const res = await post(app, submitBody({ displayQty: '10' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('iceberg_display_not_smaller');
    await app.close();
  });
});
