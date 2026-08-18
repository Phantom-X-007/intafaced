import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client';
import { createTradeRouter } from '../router.js';
import type { TradeService } from '../spot/trade-service.js';
import { MemoryTwapParentStore } from './parent-store.js';
import type { TwapParent } from './types.js';
import { assertParentHasNoMoneyFields } from './present.js';

const EDGE_SECRET = 'a-trade-algo-list-market-edge-secret-32b';
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: EDGE_SECRET, serviceName: 'svc-trade' });

function signedCaller() {
  const p = {
    sub: USER,
    userId: USER,
    sid: SESSION,
    scopes: ['trade:read'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
  const raw = encodePrincipal(p);
  return createTradeRouter({
    listAlgos: async () => [],
  } as unknown as TradeService).createCaller(
    edgeContext({
      headers: {
        'x-intafaced-principal': raw,
        'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, 'DE'),
        'x-intafaced-region': 'DE',
      },
      id: 'req-algo-list-market',
    }),
  );
}

function sampleParent(over: Partial<TwapParent> = {}): TwapParent {
  const now = new Date('2026-08-07T12:00:00.000Z');
  return {
    id: 'algo-test-1',
    userId: 'user-1',
    subAccountId: null,
    marketId: '11111111-1111-4111-8111-111111111111',
    symbol: 'BTC-USD',
    side: 'buy',
    kind: 'twap',
    totalQty: parseAmount('10'),
    durationMs: 60_000,
    sliceIntervalMs: 10_000,
    limitPrice: null,
    status: 'active',
    createdAt: now,
    startedAt: now,
    nextDueAt: now,
    projectedEndsAt: new Date(now.getTime() + 60_000),
    scheduleStretchReason: null,
    pausedAt: null,
    haltReason: null,
    lotSize: null,
    participationBps: null,
    slicesPlanned: 2,
    nextSliceIndex: 0,
    children: [],
    misses: [],
    ...over,
  };
}

describe('TwapParentStore (durable schedule residual)', () => {
  it('round-trips parent + plan without inventing fill fields', async () => {
    const store = new MemoryTwapParentStore();
    const parent = sampleParent();
    assertParentHasNoMoneyFields(parent);
    const plan = [parseAmount('5'), parseAmount('5')];
    await store.save({ parent, plan });
    const loaded = await store.load(parent.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.parent.totalQty).toBe(parseAmount('10'));
    expect(loaded!.plan).toEqual(plan);
    expect(loaded!.parent.status).toBe('active');
    assertParentHasNoMoneyFields(loaded!.parent);
  });

  it('listActive excludes paused', async () => {
    const store = new MemoryTwapParentStore();
    await store.save({
      parent: sampleParent({ id: 'a1', status: 'active' }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'a2', status: 'paused', pausedAt: new Date() }),
      plan: [parseAmount('1')],
    });
    const active = await store.listActive();
    expect(active.map((r) => r.parent.id)).toEqual(['a1']);
  });

  it('listForUser scopes ownership', async () => {
    const store = new MemoryTwapParentStore();
    await store.save({ parent: sampleParent({ id: 'u1', userId: 'alice' }), plan: [parseAmount('1')] });
    await store.save({ parent: sampleParent({ id: 'u2', userId: 'bob' }), plan: [parseAmount('1')] });
    expect((await store.listForUser('alice')).map((p) => p.id)).toEqual(['u1']);
  });

  it('listForUser returns every owned parent when status is omitted', async () => {
    const store = new MemoryTwapParentStore();
    const older = new Date('2026-08-07T11:00:00.000Z');
    const newer = new Date('2026-08-07T13:00:00.000Z');
    await store.save({
      parent: sampleParent({ id: 'paused-1', userId: 'alice', status: 'paused', createdAt: older }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'active-1', userId: 'alice', status: 'active', createdAt: newer }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'bob-paused', userId: 'bob', status: 'paused' }),
      plan: [parseAmount('1')],
    });
    expect((await store.listForUser('alice')).map((p) => p.id)).toEqual(['active-1', 'paused-1']);
  });

  it('listForUser filters by status when set and returns [] when none match', async () => {
    const store = new MemoryTwapParentStore();
    await store.save({
      parent: sampleParent({ id: 'active-1', userId: 'alice', status: 'active' }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'paused-1', userId: 'alice', status: 'paused' }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'bob-paused', userId: 'bob', status: 'paused' }),
      plan: [parseAmount('1')],
    });
    expect((await store.listForUser('alice', 'paused')).map((p) => p.id)).toEqual(['paused-1']);
    expect(await store.listForUser('alice', 'halted')).toEqual([]);
    expect(await store.listForUser('nobody')).toEqual([]);
  });

  it('listForUser mixes markets when marketId is omitted and exact-matches when set', async () => {
    const store = new MemoryTwapParentStore();
    const btc = '11111111-1111-4111-8111-111111111111';
    const eth = '22222222-2222-4222-8222-222222222222';
    await store.save({
      parent: sampleParent({ id: 'btc-active', userId: 'alice', marketId: btc, status: 'active' }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'eth-paused', userId: 'alice', marketId: eth, status: 'paused' }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'btc-paused', userId: 'alice', marketId: btc, status: 'paused' }),
      plan: [parseAmount('1')],
    });
    await store.save({
      parent: sampleParent({ id: 'bob-btc', userId: 'bob', marketId: btc, status: 'paused' }),
      plan: [parseAmount('1')],
    });
    const mixed = await store.listForUser('alice');
    expect(mixed.map((p) => p.id).sort()).toEqual(['btc-active', 'btc-paused', 'eth-paused']);
    for (const parent of mixed) assertParentHasNoMoneyFields(parent);
    expect((await store.listForUser('alice', undefined, btc)).map((p) => p.id).sort()).toEqual(['btc-active', 'btc-paused']);
    expect((await store.listForUser('alice', 'paused', btc)).map((p) => p.id)).toEqual(['btc-paused']);
    expect(await store.listForUser('alice', undefined, '33333333-3333-4333-8333-333333333333')).toEqual([]);
    expect((await store.listForUser('bob', undefined, btc)).map((p) => p.id)).toEqual(['bob-btc']);
    expect(await store.listForUser('alice', 'paused', eth)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'eth-paused' })]),
    );
    expect((await store.listForUser('nobody', undefined, btc)).map((p) => p.id)).toEqual([]);
  });

  it('algo.list refuses empty or too-long marketId', async () => {
    const caller = signedCaller();
    await expect(caller.algo.list({ marketId: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.algo.list({ marketId: 'x'.repeat(65) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('keeps the createTwap place grant across a later save that omits it', async () => {
    const store = new MemoryTwapParentStore();
    const parent = sampleParent();
    await store.save({
      parent,
      plan: [parseAmount('1')],
      grant: { scopes: ['trade:write'], sid: '33333333-3333-4333-8333-333333333333', tier: 'basic', mfa: false },
    });
    await store.save({ parent: sampleParent({ nextSliceIndex: 1 }), plan: [parseAmount('1')] });
    const loaded = await store.load(parent.id);
    expect(loaded!.grant?.scopes).toEqual(['trade:write']);
  });
});
