/**
 * HTTP door for an option combo.
 * Without named legs/ratios refuses. Missing strike/expiry/ratio refuses.
 * Does not silently rest two independent options. No invented combo book.
 */
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-option-combo-router-secretxx';
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

function legs(over: Record<string, unknown>[] = []) {
  const base = [
    { name: 'call', ratio: '1', strike: '100', expiry: EXPIRY },
    { name: 'put', ratio: '-1', strike: '100', expiry: EXPIRY },
  ];
  return base.map((leg, i) => ({ ...leg, ...(over[i] ?? {}) }));
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
    combo: true,
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

describe('POST /markets/:marketId/orders option combo', () => {
  it('combo without named legs refuses — does not rest as an option', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody());
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_combo_legs');
    expect(engine.depth(MARKET)?.bids ?? []).toEqual([]);
    await app.close();
  });

  it('missing ratio on a combo rest refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ legs: legs([{ ratio: null }]) }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_ratio');
    expect(engine.depth(MARKET)?.bids ?? []).toEqual([]);
    await app.close();
  });

  it('missing strike on a combo rest refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ legs: legs([{ strike: null }]) }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_strike');
    expect(engine.depth(MARKET)?.bids ?? []).toEqual([]);
    await app.close();
  });

  it('missing expiry on a combo rest refuses', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ legs: legs([{ expiry: null }]) }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('missing_expiry');
    expect(engine.depth(MARKET)?.bids ?? []).toEqual([]);
    await app.close();
  });

  it('named legs with ratios refuse — does not silently rest two independent options', async () => {
    const { app, engine } = await mount();
    const res = await post(app, submitBody({ legs: legs() }));
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(false);
    expect(res.json().rejected.code).toBe('combo_unsupported');
    expect(engine.depth(MARKET)?.bids ?? []).toEqual([]);
    expect(engine.depth(MARKET)?.asks ?? []).toEqual([]);
    await app.close();
  });
});
