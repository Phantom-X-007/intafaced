import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { SESSION_GONE } from './engine/session.js';
import { registerRoutes } from './router.js';

/**
 * HTTP door for session-dead (cancel-on-disconnect).
 * Caller sessionId. Missing session is 400.
 * Tagged rests cancel. New tagged submits refuse. Untagged rests stay.
 */

const SECRET = 'matching-session-dead-router-secret32';
const MARKET = 'BTC-USDT';
const OTHER = 'ETH-USDT';

function proofFor(marketId: string) {
  const observedAt = '2026-08-26T16:00:00.000Z';
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
    'PLACE',
  );
}

function submitBody(marketId: string, over: Record<string, unknown> = {}) {
  return {
    orderId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    accountId: 'desk',
    type: 'limit' as const,
    side: 'sell' as const,
    qty: '1',
    price: '100',
    tif: 'GTC' as const,
    lifecycleProof: proofFor(marketId),
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

function post(app: FastifyInstance, url: string, payloadBody: unknown, service = 'svc-trade') {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody(service, SECRET, payload) },
    payload,
  });
}

describe('POST /session/dead', () => {
  it('cancels tagged rests and refuses a later tagged submit', async () => {
    const { app } = await mount();
    const rest = await post(app, `/markets/${MARKET}/orders`, submitBody(MARKET, { sessionId: 'sess-1' }));
    expect(rest.statusCode).toBe(200);
    expect(rest.json().accepted).toBe(true);

    const other = await post(
      app,
      `/markets/${OTHER}/orders`,
      submitBody(OTHER, { orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sessionId: 'sess-1', price: '200' }),
    );
    expect(other.json().accepted).toBe(true);

    const keep = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody(MARKET, {
        orderId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        accountId: 'mm',
        sessionId: 'sess-2',
        price: '101',
      }),
    );
    expect(keep.json().accepted).toBe(true);

    const dead = await post(app, '/session/dead', { sessionId: 'sess-1' });
    expect(dead.statusCode).toBe(200);
    expect(dead.json().accepted).toBe(true);
    expect(dead.json().sessionId).toBe('sess-1');
    expect(dead.json().cancellations.map((c: { orderId: string; reason: string }) => [c.orderId, c.reason])).toEqual([
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'session_dead'],
      ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'session_dead'],
    ]);

    const later = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody(MARKET, { orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', sessionId: 'sess-1', side: 'buy', price: '100' }),
    );
    expect(later.statusCode).toBe(200);
    expect(later.json().accepted).toBe(false);
    expect(later.json().rejected.code).toBe(SESSION_GONE);
    expect(later.json().fills).toEqual([]);
  });

  it('missing session is 400 — the engine does not invent one', async () => {
    const { app } = await mount();
    const res = await post(app, '/session/dead', {});
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BadRequest');
  });

  it('svc-execution may tag COD sessionId on submit and fire session-dead', async () => {
    const { app } = await mount();
    const rest = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody(MARKET, { sessionId: 'sess-exec', qty: '1.25', price: '100.50' }),
      'svc-execution',
    );
    expect(rest.statusCode).toBe(200);
    expect(rest.json().accepted).toBe(true);
    expect(rest.json().resting.remaining).toBe('1.25');

    const unmapped = await post(app, '/session/dead', { sessionId: 'sess-exec' }, 'svc-pay');
    expect(unmapped.statusCode).toBe(403);

    const dead = await post(app, '/session/dead', { sessionId: 'sess-exec' }, 'svc-execution');
    expect(dead.statusCode).toBe(200);
    expect(dead.json().accepted).toBe(true);
    expect(dead.json().sessionId).toBe('sess-exec');
    expect(dead.json().cancellations.map((c: { orderId: string; reason: string }) => [c.orderId, c.reason])).toEqual([
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'session_dead'],
    ]);
  });

  it('svc-fix may tag COD sessionId on submit and fire session-dead', async () => {
    const { app } = await mount();
    const rest = await post(
      app,
      `/markets/${MARKET}/orders`,
      submitBody(MARKET, { sessionId: 'sess-fix', qty: '1.25', price: '100.50' }),
      'svc-fix',
    );
    expect(rest.statusCode).toBe(200);
    expect(rest.json().accepted).toBe(true);

    const unsigned = await app.inject({
      method: 'POST',
      url: '/session/dead',
      headers: { 'content-type': 'application/json', 'x-intafaced-service': 'svc-fix' },
      payload: JSON.stringify({ sessionId: 'sess-fix' }),
    });
    expect(unsigned.statusCode).toBe(401);

    const dead = await post(app, '/session/dead', { sessionId: 'sess-fix' }, 'svc-fix');
    expect(dead.statusCode).toBe(200);
    expect(dead.json().accepted).toBe(true);
    expect(dead.json().sessionId).toBe('sess-fix');
    expect(dead.json().cancellations.map((c: { orderId: string; reason: string }) => [c.orderId, c.reason])).toEqual([
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'session_dead'],
    ]);
  });

  it('untagged rest stays when a session dies', async () => {
    const { app } = await mount();
    await post(app, `/markets/${MARKET}/orders`, submitBody(MARKET));
    const dead = await post(app, '/session/dead', { sessionId: 'sess-1' });
    expect(dead.json().accepted).toBe(true);
    expect(dead.json().cancellations).toEqual([]);

    const depth = await app.inject({ method: 'GET', url: `/markets/${MARKET}/depth?limit=50` });
    expect(depth.json().asks[0][1]).toBe('1');
  });
});
