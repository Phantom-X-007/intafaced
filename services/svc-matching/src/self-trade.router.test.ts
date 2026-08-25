import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for self-trade. Expire the rest. Taker continues. No invented self-fill.
 */

const SECRET = 'matching-self-trade-router-secret-32';
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

describe('POST /markets/:marketId/orders self-trade', () => {
  it('crossing own rest expires the rest — taker continues, no self-fill', async () => {
    const { app, engine } = await mount();
    const own = '11111111-1111-4111-8111-111111111111';
    const take = '33333333-3333-4333-8333-333333333333';

    expect((await post(app, submitBody({ orderId: own, accountId: 'same', side: 'sell', qty: '1' }))).statusCode).toBe(200);

    const res = await post(app, submitBody({ orderId: take, accountId: 'same', side: 'buy', qty: '1' }));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.rejected).toBeNull();
    expect(body.fills).toEqual([]);
    expect(body.cancellations).toHaveLength(1);
    expect(body.cancellations[0].orderId).toBe(own);
    expect(body.cancellations[0].reason).toBe('self_trade_prevention');
    expect(body.resting.orderId).toBe(take);
    expect(
      engine
        .book(MARKET)
        .toState()
        .bids.map((l) => l.orders.map((o) => o.orderId)),
    ).toEqual([[take]]);
    expect(engine.book(MARKET).toState().asks).toEqual([]);
    await app.close();
  });

  it('crossing a different account still fills', async () => {
    const { app } = await mount();
    const maker = '11111111-1111-4111-8111-111111111111';
    const take = '33333333-3333-4333-8333-333333333333';

    await post(app, submitBody({ orderId: maker, accountId: 'mm', side: 'sell', qty: '1' }));
    const res = await post(app, submitBody({ orderId: take, accountId: 'desk', side: 'buy', qty: '1' }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills[0].makerAccountId).toBe('mm');
    expect(res.json().fills[0].takerAccountId).toBe('desk');
    expect(res.json().fills[0].qty).toBe('1');
    await app.close();
  });
});
