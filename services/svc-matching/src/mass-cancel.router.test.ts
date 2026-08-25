import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { SESSION_UNSUPPORTED } from './engine/mass-cancel.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for mass-cancel by owner. Owner is accountId.
 * Missing account is 400. Session id refuses. Other owners stay.
 */

const SECRET = 'matching-mass-cancel-router-secret-32';
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
    side: 'sell' as const,
    qty: '1',
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

function post(app: FastifyInstance, url: string, payloadBody: unknown) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

describe('POST /markets/:marketId/orders/mass-cancel', () => {
  it('pulls the owner and leaves a different owner', async () => {
    const { app, engine } = await mount();
    const own = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
      }),
    );
    expect(own.statusCode).toBe(200);
    expect(own.json().accepted).toBe(true);

    const other = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '22222222-2222-4222-8222-222222222222',
        accountId: 'mm',
        price: '101',
      }),
    );
    expect(other.statusCode).toBe(200);

    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, { accountId: 'desk' });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().rejected).toBeNull();
    expect(res.json().cancellations).toHaveLength(1);
    expect(res.json().cancellations[0].orderId).toBe('11111111-1111-4111-8111-111111111111');
    expect(res.json().cancellations[0].reason).toBe('requested');

    const live = engine.book(MARKET).toState();
    const ids = [...live.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...live.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
    expect(ids).toEqual(['22222222-2222-4222-8222-222222222222']);
    await app.close();
  });

  it('missing account refuses — no invented owner', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
      }),
    );
    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BadRequest');
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.orderId).toBe('11111111-1111-4111-8111-111111111111');
    await app.close();
  });

  it('session id refuses — the engine does not invent a session', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
      }),
    );
    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, { accountId: 'desk', sessionId: 'sess-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe(SESSION_UNSUPPORTED);
    expect(res.json().cancellations).toEqual([]);
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.orderId).toBe('11111111-1111-4111-8111-111111111111');
    await app.close();
  });

  it('empty book is an accepted no-op', async () => {
    const { app } = await mount();
    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, { accountId: 'desk' });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().cancellations).toEqual([]);
    await app.close();
  });

  it('buy-only leaves the sell rest', async () => {
    const { app, engine } = await mount();
    const sell = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
        side: 'sell',
        price: '101',
      }),
    );
    expect(sell.statusCode).toBe(200);
    const buy = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '33333333-3333-4333-8333-333333333333',
        accountId: 'desk',
        side: 'buy',
        price: '99',
      }),
    );
    expect(buy.statusCode).toBe(200);

    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, { accountId: 'desk', side: 'buy' });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().cancellations).toHaveLength(1);
    expect(res.json().cancellations[0].orderId).toBe('33333333-3333-4333-8333-333333333333');

    const live = engine.book(MARKET).toState();
    const ids = [...live.bids.flatMap((l) => l.orders.map((o) => o.orderId)), ...live.asks.flatMap((l) => l.orders.map((o) => o.orderId))];
    expect(ids).toEqual(['11111111-1111-4111-8111-111111111111']);
    await app.close();
  });

  it('missing side still cancels both', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
        side: 'sell',
        price: '101',
      }),
    );
    await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '33333333-3333-4333-8333-333333333333',
        accountId: 'desk',
        side: 'buy',
        price: '99',
      }),
    );
    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, { accountId: 'desk' });
    expect(res.statusCode).toBe(200);
    expect(res.json().cancellations).toHaveLength(2);
    expect(engine.book(MARKET).toState().bids).toEqual([]);
    expect(engine.book(MARKET).toState().asks).toEqual([]);
    await app.close();
  });

  it('session id with a side still refuses', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
        side: 'sell',
      }),
    );
    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, {
      accountId: 'desk',
      side: 'sell',
      sessionId: 'sess-1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe(SESSION_UNSUPPORTED);
    expect(res.json().cancellations).toEqual([]);
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.orderId).toBe('11111111-1111-4111-8111-111111111111');
    await app.close();
  });

  it('unknown side is 400 — the engine does not invent a side', async () => {
    const { app, engine } = await mount();
    await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
      }),
    );
    const res = await post(app, `/markets/${MARKET}/orders/mass-cancel`, { accountId: 'desk', side: 'bid' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BadRequest');
    expect(engine.book(MARKET).toState().asks[0]!.orders[0]!.orderId).toBe('11111111-1111-4111-8111-111111111111');
    await app.close();
  });
});
