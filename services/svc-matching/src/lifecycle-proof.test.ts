import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import { MemoryEventBus } from '@intafaced/events';
import { createMarketLifecycleAdmissionProof, type MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { describe, expect, it } from 'vitest';
import { MatchingEngine } from './engine/engine.js';
import { FileJournal, MemoryJournal } from './engine/journal.js';
import { registerRoutes } from './router.js';

const SECRET = 'matching-lifecycle-proof-test-secret-32';
const MARKET = 'BTC-USDT';

function proofFor(marketId = MARKET, action: 'PLACE' | 'PLACE_POST_ONLY' = 'PLACE'): MarketLifecycleAdmissionProof {
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

function body(over: Record<string, unknown> = {}) {
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

function engine(journal: MemoryJournal | FileJournal = new MemoryJournal()) {
  const bus = new MemoryEventBus('svc-matching');
  return {
    engine: new MatchingEngine({ journal, bus, snapshotEvery: 0 }),
    bus,
    journal,
  };
}

async function mount(matching: MatchingEngine): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerRoutes(app, matching, SECRET, { bodyBind: 'require' });
  await app.ready();
  return app;
}

async function submit(app: FastifyInstance, payloadBody: unknown, marketId = MARKET) {
  const payload = JSON.stringify(payloadBody);
  return app.inject({
    method: 'POST',
    url: `/markets/${marketId}/orders`,
    headers: { 'content-type': 'application/json', ...serviceAuthHeadersForBody('svc-trade', SECRET, payload) },
    payload,
  });
}

describe('private order lifecycle admission proof', () => {
  it.each([
    ['missing proof', () => ({ lifecycleProof: undefined })],
    [
      'bad snapshot hash',
      () => ({ lifecycleProof: { ...proofFor(), snapshot: { ...proofFor().snapshot, reasonCode: 'tampered.reason' } } }),
    ],
    ['wrong market', () => ({ lifecycleProof: proofFor('ETH-USDT') })],
    ['wrong action for PO', () => ({ tif: 'PO', lifecycleProof: proofFor(MARKET, 'PLACE') })],
    [
      'disallowed action',
      () => ({
        lifecycleProof: { ...proofFor('BTC-USDT', 'PLACE_POST_ONLY'), snapshot: { ...proofFor().snapshot, allowedActions: ['PLACE'] } },
      }),
    ],
    ['checkedAt tampering', () => ({ lifecycleProof: { ...proofFor(), checkedAt: '2026-08-24T16:00:01.000Z' } })],
    ['evidence tampering', () => ({ lifecycleProof: { ...proofFor(), evidenceRefs: ['tampered-evidence'] } })],
    ['transition tampering', () => ({ lifecycleProof: { ...proofFor(), transitionId: 'tampered-transition' } })],
  ])('refuses %s before every durable side effect', async (_label, mutate) => {
    const { engine: matching, journal, bus } = engine();
    const app = await mount(matching);
    const res = await submit(app, body(mutate()));

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BadRequest');
    expect(journal.length).toBe(0);
    expect(matching.markets).toEqual([]);
    expect(bus.published).toEqual([]);
    await app.close();
  });

  it('persists the full validated proof, matches normally, and recovers after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'matching-lifecycle-proof-'));
    const path = join(dir, 'engine.ndjson');
    const firstJournal = new FileJournal(path);
    const firstBus = new MemoryEventBus('svc-matching');
    const first = new MatchingEngine({ journal: firstJournal, bus: firstBus, snapshotEvery: 0 });
    const app = await mount(first);
    const proof = proofFor();

    const accepted = await submit(app, body({ lifecycleProof: proof }));
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ accepted: true, resting: { orderId: body().orderId } });
    const firstRecord = firstJournal.read()[0];
    expect(firstRecord?.kind).toBe('submit');
    if (firstRecord?.kind === 'submit') expect(firstRecord.order.lifecycleProof).toEqual(proof);
    expect(firstBus.published).toHaveLength(1);
    await app.close();
    firstJournal.close();

    const replayJournal = new FileJournal(path);
    const replayBus = new MemoryEventBus('svc-matching');
    const restarted = new MatchingEngine({ journal: replayJournal, bus: replayBus, snapshotEvery: 0 });
    expect(restarted.recover()).toEqual({ records: 1, markets: 1 });
    const replayRecord = replayJournal.read()[0];
    if (replayRecord?.kind === 'submit') expect(replayRecord.order.lifecycleProof).toEqual(proof);
    expect(restarted.restingOrders()).toMatchObject([{ orderId: body().orderId }]);
    expect(replayBus.published).toEqual([]);
    replayJournal.close();
  });

  it('replays legacy submit records with proof absent', async () => {
    const journal = new MemoryJournal();
    journal.append({
      kind: 'submit',
      marketId: MARKET,
      at: '2026-08-24T16:00:00.000Z',
      order: {
        orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        accountId: 'acct-legacy',
        type: 'limit',
        side: 'sell',
        qty: '1',
        price: '101',
        stopPrice: null,
        tif: 'GTC',
      },
    });
    const { engine: restarted } = engine(journal);
    expect(restarted.recover()).toEqual({ records: 1, markets: 1 });
    const legacyRecord = journal.read()[0];
    if (legacyRecord?.kind === 'submit') expect(legacyRecord.order.lifecycleProof).toBeUndefined();
    expect(restarted.restingOrders()).toMatchObject([{ orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }]);
  });
});
