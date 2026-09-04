/**
 * H8c HTTP door (matching half): submit 200 then trade death — retry does not
 * double-rest or duplicate-fill. Hold stays is the trade PR.
 * Hitch H8e IFM crash; do not recut it. Qty/price stay decimal strings.
 * Replay must not invent a cancel.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { MatchingEngine } from './engine/engine.js';
import { FileJournal, replay } from './engine/journal.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-h8c-submit-200-retry-secret-32';
const MARKET = 'BTC-USDT';
const REST = '11111111-1111-4111-8111-111111111111';
const ASK = '33333333-3333-4333-8333-333333333333';
const ASK2 = '44444444-4444-4444-8444-444444444444';
const TAKE = '22222222-2222-4222-8222-222222222222';

function proofFor(action: 'PLACE' | 'AMEND' = 'PLACE') {
  const observedAt = '2026-09-03T16:00:00.000Z';
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
    orderId: REST,
    accountId: 'desk',
    type: 'limit' as const,
    side: 'sell' as const,
    qty: '1.5',
    price: '100',
    tif: 'GTC' as const,
    lifecycleProof: proofFor('PLACE'),
    ...over,
  };
}

function tmpJournal(): string {
  return join(mkdtempSync(join(tmpdir(), 'matching-h8c-submit-200-')), 'engine.ndjson');
}

async function mount(journal: FileJournal): Promise<{ app: FastifyInstance; engine: MatchingEngine; journal: FileJournal }> {
  const engine = new MatchingEngine({ journal, bus: new MemoryEventBus('svc-matching'), snapshotEvery: 0 });
  const app = Fastify({ logger: false });
  registerRoutes(app, engine, SECRET, { bodyBind: 'require' });
  await app.ready();
  return { app, engine, journal };
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

function getOrders(app: FastifyInstance) {
  return app.inject({
    method: 'GET',
    url: `/markets/${MARKET}/orders`,
    headers: { ...serviceAuthHeadersForBody('svc-trade', SECRET, '') },
  });
}

function diskKinds(path: string): string[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => (JSON.parse(line) as { kind: string }).kind);
}

describe('H8c HTTP submit 200 retry — no second rest, no duplicate fill', () => {
  it('HTTP 200 rest then trade death: retry of the same id does not double-live', async () => {
    const path = tmpJournal();
    const liveJournal = new FileJournal(path);
    const { app } = await mount(liveJournal);

    const placed = await post(app, submitBody());
    expect(placed.statusCode).toBe(200);
    expect(placed.json().accepted).toBe(true);
    expect(placed.json().resting.remaining).toBe('1.5');
    expect(placed.json().resting.price).toBe('100');
    expect(typeof placed.json().resting.remaining).toBe('string');
    expect(typeof placed.json().resting.price).toBe('string');

    const retry = await post(app, submitBody({ accountId: 'other', qty: '9', price: '50' }));
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({
      accepted: false,
      rejected: { code: 'duplicate_order_id' },
      fills: [],
      resting: null,
    });

    const listed = await getOrders(app);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().orders).toHaveLength(1);
    expect(listed.json().orders[0]).toMatchObject({ orderId: REST, remaining: '1.5', price: '100' });
    expect(typeof listed.json().orders[0].remaining).toBe('string');
    expect(typeof listed.json().orders[0].price).toBe('string');

    expect(diskKinds(path)).toEqual(['submit']);
    expect(diskKinds(path).includes('cancel')).toBe(false);

    const books = replay(liveJournal.read());
    expect(
      books
        .get(MARKET)
        ?.toState()
        .asks[0]!.orders.map((o) => o.orderId),
    ).toEqual([REST]);

    await app.close();
    liveJournal.close();
  });

  it('HTTP 200 fill then trade death: retry of the same id does not emit a duplicate fill', async () => {
    const path = tmpJournal();
    const liveJournal = new FileJournal(path);
    const { app: liveApp } = await mount(liveJournal);

    expect((await post(liveApp, submitBody({ orderId: ASK, accountId: 'mm', qty: '1', price: '100' }))).statusCode).toBe(200);
    expect((await post(liveApp, submitBody({ orderId: ASK2, accountId: 'mm2', qty: '1', price: '100' }))).statusCode).toBe(200);

    const filled = await post(liveApp, submitBody({ orderId: TAKE, accountId: 'taker', side: 'buy', qty: '1', price: '100' }));
    expect(filled.statusCode).toBe(200);
    expect(filled.json().accepted).toBe(true);
    expect(filled.json().fills).toHaveLength(1);
    expect(filled.json().fills[0]).toMatchObject({
      makerOrderId: ASK,
      takerOrderId: TAKE,
      qty: '1',
      price: '100',
    });
    expect(typeof filled.json().fills[0].qty).toBe('string');
    expect(typeof filled.json().fills[0].price).toBe('string');
    expect(filled.json().resting).toBeNull();

    await liveApp.close();
    liveJournal.close();

    const recoveredJournal = new FileJournal(path);
    const recovered = new MatchingEngine({
      journal: recoveredJournal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    });
    recovered.recover();
    const app = Fastify({ logger: false });
    registerRoutes(app, recovered, SECRET, { bodyBind: 'require' });
    await app.ready();

    const retry = await post(app, submitBody({ orderId: TAKE, accountId: 'taker', side: 'buy', qty: '1', price: '100' }));
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({
      accepted: false,
      rejected: { code: 'duplicate_order_id' },
      fills: [],
      resting: null,
    });

    const listed = await getOrders(app);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().orders).toHaveLength(1);
    expect(listed.json().orders[0]).toMatchObject({ orderId: ASK2, remaining: '1', price: '100' });
    expect(typeof listed.json().orders[0].remaining).toBe('string');
    expect(typeof listed.json().orders[0].price).toBe('string');

    expect(diskKinds(path)).toEqual(['submit', 'submit', 'submit']);
    expect(diskKinds(path).includes('cancel')).toBe(false);

    const books = replay(recoveredJournal.read());
    expect(
      books
        .get(MARKET)
        ?.toState()
        .asks[0]!.orders.map((o) => o.orderId),
    ).toEqual([ASK2]);
    expect(books.get(MARKET)?.toState().acceptedOrderIds).toEqual([TAKE, ASK]);

    await app.close();
    recoveredJournal.close();
  });
});
