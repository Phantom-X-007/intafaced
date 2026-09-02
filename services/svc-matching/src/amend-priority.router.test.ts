import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for native amend priority (PX-S03 §8.2).
 * PATCH states retained or lost. Cancel/replace is not this door.
 */

const SECRET = 'matching-amend-priority-router-secret-32';
const MARKET = 'BTC-USDT';

function proof(action: 'PLACE' | 'AMEND') {
  const observedAt = '2026-09-02T19:00:00.000Z';
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
      allowedActions: ['PLACE', 'PLACE_POST_ONLY', 'AMEND'],
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
    qty: '2',
    price: '100',
    tif: 'GTC' as const,
    lifecycleProof: proof('PLACE'),
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

function patch(app: FastifyInstance, orderId: string, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'PATCH',
    url: `/markets/${MARKET}/orders/${orderId}`,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

describe('PATCH /markets/:marketId/orders/:orderId native amend priority', () => {
  it('qty-down at the same price returns priority retained', async () => {
    const { app } = await mount();
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    expect((await post(app, submitBody({ orderId: first, qty: '2' }))).statusCode).toBe(200);
    expect((await post(app, submitBody({ orderId: second, accountId: 'other', qty: '1' }))).statusCode).toBe(200);

    const res = await patch(app, first, { expectedVersion: 1, qty: '1', lifecycleProof: proof('AMEND') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.priority).toBe('retained');
    expect(body.sequence).toBe(1);
    expect(body.version).toBe(2);
    expect(body.resting.remaining).toBe('1');
    await app.close();
  });

  it('qty-up returns priority lost', async () => {
    const { app } = await mount();
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    await post(app, submitBody({ orderId: first, qty: '1' }));
    await post(app, submitBody({ orderId: second, accountId: 'other', qty: '1' }));

    const res = await patch(app, first, { expectedVersion: 1, qty: '2', lifecycleProof: proof('AMEND') });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.priority).toBe('lost');
    expect(body.sequence).not.toBe(1);
    await app.close();
  });
});
