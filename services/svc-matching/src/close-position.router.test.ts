import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { ZERO } from '@intafaced/ledger-client/money';
import { netPositionOf } from './engine/close-position.js';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';
import { userCopy } from './user-copy.js';

/**
 * HTTP door for close-position. svc-trade only. 200 + presentSubmit,
 * including position_flat as accepted:false.
 */

const SECRET = 'matching-close-position-router-secret-32';
const MARKET = 'BTC-USDT';

function proofFor(marketId = MARKET, action: 'PLACE' | 'PLACE_POST_ONLY' = 'PLACE') {
  const observedAt = '2026-08-24T16:00:00.000Z';
  return createMarketLifecycleAdmissionProof(
    {
      marketId,
      ruleVersion: 'test.rules.v1',
      instrumentId: marketId,
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

function closeBody(over: Record<string, unknown> = {}) {
  return {
    orderId: '55555555-5555-4555-8555-555555555555',
    accountId: 'desk',
    lifecycleProof: proofFor(),
    ...over,
  };
}

function submitBody(over: Record<string, unknown> = {}) {
  return {
    orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    accountId: 'acct-a',
    type: 'limit' as const,
    side: 'buy' as const,
    qty: '1',
    price: '100',
    tif: 'GTC' as const,
    lifecycleProof: proofFor(),
    ...over,
  };
}

async function mount(engine: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRoutes(app, engine as never, SECRET, { bodyBind: 'require' });
  await app.ready();
  return app;
}

function post(app: FastifyInstance, url: string, payloadBody: unknown, service = 'svc-trade') {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody(service, SECRET, payload) },
    payload,
  });
}

describe('POST /markets/:marketId/positions/close', () => {
  it('refuses an unauthenticated close, and the engine is never called', async () => {
    let called = false;
    const app = await mount({ closePosition: async () => ((called = true), { accepted: true }) });

    const res = await app.inject({
      method: 'POST',
      url: `/markets/${MARKET}/positions/close`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(closeBody()),
    });

    expect(res.statusCode).toBe(401);
    expect(called).toBe(false);
    await app.close();
  });

  it('returns a stable 403 for an authenticated non-trade close', async () => {
    let called = false;
    const app = await mount({ closePosition: async () => ((called = true), { accepted: true }) });
    const res = await post(app, `/markets/${MARKET}/positions/close`, closeBody(), 'svc-execution');

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ code: 'Forbidden', message: userCopy('error.forbidden') });
    expect(called).toBe(false);
    await app.close();
  });

  it('returns 200 presentSubmit for a flat account — accepted:false, position_flat', async () => {
    const journal = new MemoryJournal();
    const engine = new MatchingEngine({ journal, bus: new MemoryEventBus('svc-matching'), snapshotEvery: 0 });
    const app = await mount(engine);

    const res = await post(app, `/markets/${MARKET}/positions/close`, closeBody());

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      accepted: false,
      sequence: null,
      rejected: { code: 'position_flat' },
    });
    expect(engine.hasMarket(MARKET)).toBe(false);
    expect(journal.length).toBe(0);
    await app.close();
  });

  it('closes a long through the HTTP door and fills at the book price', async () => {
    const journal = new MemoryJournal();
    const engine = new MatchingEngine({ journal, bus: new MemoryEventBus('svc-matching'), snapshotEvery: 0 });
    const app = await mount(engine);

    const ask = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '22222222-2222-4222-8222-222222222222',
        accountId: 'mm',
        side: 'sell',
        qty: '2',
        price: '100',
      }),
    );
    expect(ask.statusCode).toBe(200);
    expect(ask.json().accepted).toBe(true);

    const open = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '11111111-1111-4111-8111-111111111111',
        accountId: 'desk',
        side: 'buy',
        qty: '2',
        price: '100',
      }),
    );
    expect(open.json().accepted).toBe(true);

    const bid = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody({
        orderId: '33333333-3333-4333-8333-333333333333',
        accountId: 'liq',
        side: 'buy',
        qty: '2',
        price: '100',
      }),
    );
    expect(bid.json().accepted).toBe(true);

    const res = await post(app, `/markets/${MARKET}/positions/close`, closeBody());

    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    expect(res.json().fills).toHaveLength(1);
    expect(res.json().fills[0]).toMatchObject({ qty: '2', price: '100', takerSide: 'sell' });
    expect(netPositionOf(engine.existingBook(MARKET)!, 'desk')).toBe(ZERO);
    await app.close();
  });
});
