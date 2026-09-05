import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { SubmitRequest, VenueExecution } from '@intafaced/venue-adapter';
import type { VenueOrder } from '@intafaced/venue-contracts';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { FileEmsOrderStore } from './file-ems-order-store.js';
import { latencyGradeWire } from './oms-plan.js';
import type { OmsFetchFn } from './oms-fetch.js';
import type { OmsSubmitFn } from './oms-execute.js';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-mount-test-edge-secret-long';
const OP = '33333333-3333-4333-8333-333333333333';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function hmacSigned(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-execution' as const };
}

describe('execution.tenant tRPC', () => {
  it('refuses anonymous kill', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    await expect(router.createCaller(anonymous()).execution.tenant.kill({ tenantId: 'house-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('describe + kill are reachable; kill blocks later authorize', async () => {
    const registry = new SealedHouseTenantRegistry();
    registry.register('house-1', 'seed');
    const caller = createExecutionRouter(registry).createCaller(hmacSigned());

    const before = await caller.execution.tenant.describe({ tenantId: 'house-1' });
    expect(before).toMatchObject({ tenantId: 'house-1', killed: false });

    await caller.execution.tenant.kill({ tenantId: 'house-1' });
    const after = await caller.execution.tenant.describe({ tenantId: 'house-1' });
    expect(after).toMatchObject({ killed: true });

    const auth = registry.authorize('house-1', { kind: 'external', venueId: 'ext-1' }, 'bot');
    expect(auth).toMatchObject({ ok: false, reason: 'kill_switch' });
  });

  it('package refuse for matching-book is independent of the router', () => {
    const registry = new SealedHouseTenantRegistry();
    registry.register('house-1', 'seed');
    expect(registry.authorize('house-1', { kind: 'matching-book' }, 'bot')).toMatchObject({
      ok: false,
      reason: 'internal_venue',
    });
  });
});

const venueBody = {
  id: 'street',
  kind: 'external-cex' as const,
  price: '100',
  amount: '10',
  feeBps: 10,
  costTerms: {
    feeBps: 10,
    expectedImpactBps: 5,
    transferCostBps: 2,
    latencyGrade: latencyGradeWire('street'),
  },
};

describe('execution.oms plan → execute → fetch + EMS journal', () => {
  it('records venue ack in EMS and fetch reads the injected venue row', async () => {
    const emsStore = new InMemoryEmsOrderStore();
    const calls: SubmitRequest[] = [];
    const submit: OmsSubmitFn = async (req) => {
      calls.push(req);
      const execution: VenueExecution = {
        venueId: 'street',
        venueOrderId: 'v-street-1',
        filledAmount: req.amount,
        averagePrice: req.limitPrice,
        feeAmount: parseAmount('0'),
        feeAsset: 'USDT',
        status: 'filled',
        executedAt: new Date('2026-08-22T00:00:00.000Z'),
      };
      return execution;
    };
    const fetch: OmsFetchFn = async (symbol, clientOrderId) => {
      const order: VenueOrder = {
        venueId: 'street',
        venueOrderId: 'v-street-1',
        clientOrderId,
        symbol,
        side: 'buy',
        type: 'limit',
        price: parseAmount('100'),
        amount: parseAmount('1'),
        filled: parseAmount('1'),
        remaining: parseAmount('0'),
        averagePrice: parseAmount('100'),
        status: 'filled',
        feePaid: parseAmount('0'),
        feeAsset: 'USDT',
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
        observedAt: new Date('2026-08-22T00:00:00.000Z'),
      };
      return order;
    };

    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      { street: submit },
      {},
      { street: fetch },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      emsStore,
    ).createCaller(hmacSigned());

    const planned = await caller.execution.oms.plan({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'mount-parent-1',
      venues: [venueBody],
    });
    expect(planned.ok).toBe(true);
    expect(calls).toHaveLength(0);

    const executed = await caller.execution.oms.execute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'mount-parent-1',
      venues: [venueBody],
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(calls).toHaveLength(1);
    const clientOrderId = executed.children[0]!.clientOrderId;
    expect(calls[0]?.clientOrderId).toBe(clientOrderId);

    const ack = await caller.execution.oms.ems.get({ clientOrderId });
    expect(ack.execution?.venueOrderId).toBe('v-street-1');
    expect(emsStore.list({ venueId: 'street', symbol: 'BTC/USDT' })).toHaveLength(1);

    const fetched = await caller.execution.oms.fetch({
      venueId: 'street',
      symbol: 'BTC/USDT',
      clientOrderId,
    });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.order.venueOrderId).toBe('v-street-1');
  });

  it('refuses execute when venue submit is not wired', async () => {
    const emsStore = new InMemoryEmsOrderStore();
    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      emsStore,
    ).createCaller(hmacSigned());
    const out = await caller.execution.oms.execute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'mount-unwired',
      venues: [venueBody],
    });
    expect(out).toMatchObject({ ok: false, reason: 'submit_failed' });
  });
});

function tempEmsJournalPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ems-mount-'));
  return join(dir, 'ems-acks.jsonl');
}

describe('execution.oms EMS file journal mount', () => {
  it('ems.list/get survive FileEmsOrderStore reload after execute', async () => {
    const journalPath = tempEmsJournalPath();
    const emsStore = new FileEmsOrderStore(journalPath);
    const calls: SubmitRequest[] = [];
    const submit: OmsSubmitFn = async (req) => {
      calls.push(req);
      const execution: VenueExecution = {
        venueId: 'street',
        venueOrderId: 'v-street-file-1',
        filledAmount: req.amount,
        averagePrice: req.limitPrice,
        feeAmount: parseAmount('0'),
        feeAsset: 'USDT',
        status: 'filled',
        executedAt: new Date('2026-08-22T00:00:00.000Z'),
      };
      return execution;
    };

    const fetch: OmsFetchFn = async () => {
      throw new Error('fetch unused');
    };

    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      { street: submit },
      {},
      { street: fetch },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      emsStore,
    ).createCaller(hmacSigned());

    const executed = await caller.execution.oms.execute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'mount-file-parent',
      venues: [venueBody],
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(calls).toHaveLength(1);

    const clientOrderId = executed.children[0]!.clientOrderId;
    const ack = await caller.execution.oms.ems.get({ clientOrderId });
    expect(ack.execution?.venueOrderId).toBe('v-street-file-1');

    const reloadedStore = new FileEmsOrderStore(journalPath);
    const reloadedCaller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      { street: submit },
      {},
      { street: fetch },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      reloadedStore,
    ).createCaller(hmacSigned());

    const list = await reloadedCaller.execution.oms.ems.list({ venueId: 'street', symbol: 'BTC/USDT' });
    expect(list).toHaveLength(1);
    expect(list[0]?.clientOrderId).toBe(clientOrderId);

    const ackReloaded = await reloadedCaller.execution.oms.ems.get({ clientOrderId });
    expect(ackReloaded.execution?.venueOrderId).toBe('v-street-file-1');

    rmSync(join(journalPath, '..'), { recursive: true, force: true });
  });
});
