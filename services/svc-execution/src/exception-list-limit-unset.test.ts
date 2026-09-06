/**
 * Unit card — execution.oms.unattended / orphaned refuse unpublished page size (never invent 50)
 *
 * 1. Promise: omit / NaN / 0 throws named unset. Owner-explicit 50 still pages.
 *    Zod still caps 1..200 (same window as ems.list).
 * 2. Break: unattended/orphaned with no page size dumps the store.
 * 3. Done bar: unset throws named *ListLimitUnsetError; 50 is allowed
 * 4. Class N
 * 5. Paths: services/svc-execution/src/ems-list-limit.ts, router.ts
 *
 * Store.list remains the kill / TCA / /ready work set — not recut here.
 * failedHedges / unconfirmed stay parent-id filtered — not milled.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { VenueExecution } from '@intafaced/venue-adapter';
import {
  assertOrphanedListLimit,
  assertUnattendedListLimit,
  EMS_LIST_LIMIT_CAP,
  EXECUTION_ORPHANED_LIST_LIMIT_UNSET,
  EXECUTION_UNATTENDED_LIST_LIMIT_UNSET,
  OrphanedListLimitUnsetError,
  UnattendedListLimitUnsetError,
} from './ems-list-limit.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import { InMemoryApprovedAlgoParentStore, type ApprovedAlgoParent, type RetainedAlgoSchedule } from './oms-start.js';
import { createExecutionRouter } from './router.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SECRET = 'a-execution-exception-list-limit-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const ORIGINATOR = '55555555-5555-4555-8555-555555555555';
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

function hmacSigned(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return {
    ...edgeContext({
      headers: {
        'x-intafaced-principal': raw,
        'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
        'x-intafaced-region': 'DE',
      },
      id: 'req-signed',
    }),
    service: 'svc-execution' as const,
  };
}

function retainedTwap(): RetainedAlgoSchedule {
  return { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null };
}

function live(over: Partial<ApprovedAlgoParent> & Pick<ApprovedAlgoParent, 'parentClientOrderId' | 'kind'>): ApprovedAlgoParent {
  return {
    status: 'approved',
    startedAt: null,
    residual: { remaining: '10' },
    originator: ORIGINATOR,
    ...over,
    schedule: over.schedule ?? retainedTwap(),
  };
}

function ack(id: string): VenueExecution {
  return {
    venueId: 'street',
    venueOrderId: `v-${id}`,
    filledAmount: parseAmount('1'),
    averagePrice: parseAmount('100'),
    feeAmount: parseAmount('0'),
    feeAsset: 'USDT',
    status: 'filled',
    executedAt: new Date('2026-08-22T00:00:00.000Z'),
  };
}

function routerSrc(): string {
  return readFileSync(join(ROOT, 'services/svc-execution/src/router.ts'), 'utf8');
}

describe('assertUnattendedListLimit', () => {
  it('refuses blank / NaN / 0 — never invents 50', () => {
    expect(() => assertUnattendedListLimit(undefined)).toThrow(UnattendedListLimitUnsetError);
    expect(() => assertUnattendedListLimit(null)).toThrow(UnattendedListLimitUnsetError);
    expect(() => assertUnattendedListLimit(Number.NaN)).toThrow(UnattendedListLimitUnsetError);
    expect(() => assertUnattendedListLimit(0)).toThrow(UnattendedListLimitUnsetError);
    try {
      assertUnattendedListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(UnattendedListLimitUnsetError);
      expect((e as UnattendedListLimitUnsetError).code).toBe(EXECUTION_UNATTENDED_LIST_LIMIT_UNSET);
      expect((e as UnattendedListLimitUnsetError).message).toMatch(/never invent 50/);
      expect((e as UnattendedListLimitUnsetError).message).not.toMatch(/default 50|50-row/i);
    }
  });

  it('owner-explicit 50 is allowed and caps at 200', () => {
    expect(assertUnattendedListLimit(50)).toBe(50);
    expect(assertUnattendedListLimit(1)).toBe(1);
    expect(assertUnattendedListLimit(EMS_LIST_LIMIT_CAP + 1)).toBe(EMS_LIST_LIMIT_CAP);
  });
});

describe('assertOrphanedListLimit', () => {
  it('refuses blank / NaN / 0 — never invents 50', () => {
    expect(() => assertOrphanedListLimit(undefined)).toThrow(OrphanedListLimitUnsetError);
    expect(() => assertOrphanedListLimit(null)).toThrow(OrphanedListLimitUnsetError);
    expect(() => assertOrphanedListLimit(Number.NaN)).toThrow(OrphanedListLimitUnsetError);
    expect(() => assertOrphanedListLimit(0)).toThrow(OrphanedListLimitUnsetError);
    try {
      assertOrphanedListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(OrphanedListLimitUnsetError);
      expect((e as OrphanedListLimitUnsetError).code).toBe(EXECUTION_ORPHANED_LIST_LIMIT_UNSET);
      expect((e as OrphanedListLimitUnsetError).message).toMatch(/never invent 50/);
      expect((e as OrphanedListLimitUnsetError).message).not.toMatch(/default 50|50-row/i);
    }
  });

  it('owner-explicit 50 is allowed and caps at 200', () => {
    expect(assertOrphanedListLimit(50)).toBe(50);
    expect(assertOrphanedListLimit(1)).toBe(1);
    expect(assertOrphanedListLimit(EMS_LIST_LIMIT_CAP + 1)).toBe(EMS_LIST_LIMIT_CAP);
  });
});

describe('execution.oms.unattended limit unset refuse', () => {
  it('router does not dump the parent store when unattended omits limit', () => {
    const src = routerSrc();
    const start = src.indexOf('unattended: scopedProcedure');
    const end = src.indexOf('killUnattended:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertUnattendedListLimit(input.limit)');
    expect(fn).toContain('limit: z.number().int().min(1).max(200).optional()');
    expect(fn).toContain('.slice(0, limit)');
    expect(fn).toContain('execution.unattended_list_limit_unset');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit = 50/);
  });

  it('omit / empty input refuses PRECONDITION_FAILED — never dumps both parents', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(live({ parentClientOrderId: 'unowned-1', kind: 'twap' }));
    parentStore.seed(live({ parentClientOrderId: 'unowned-2', kind: 'vwap' }));
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
      undefined,
      undefined,
      undefined,
      parentStore,
    ).createCaller(hmacSigned());

    await expect(caller.execution.oms.unattended({})).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: /never invent 50/,
    });

    const page = await caller.execution.oms.unattended({ limit: 1 });
    expect(page).toMatchObject({ ok: true });
    if (!page.ok) return;
    expect(page.parents).toHaveLength(1);

    const explicit50 = await caller.execution.oms.unattended({ limit: 50 });
    expect(explicit50).toMatchObject({ ok: true });
    if (!explicit50.ok) return;
    expect(explicit50.parents).toHaveLength(2);
    expect(parentStore.list()).toHaveLength(2);

    const emptyStore = new InMemoryApprovedAlgoParentStore();
    const emptyCaller = createExecutionRouter(
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
      undefined,
      undefined,
      undefined,
      emptyStore,
    ).createCaller(hmacSigned());
    await expect(emptyCaller.execution.oms.unattended({ limit: 50 })).resolves.toEqual({ ok: true, parents: [] });
  });
});

describe('execution.oms.orphaned limit unset refuse', () => {
  it('router does not dump the EMS store when orphaned omits limit', () => {
    const src = routerSrc();
    const start = src.indexOf('orphaned: scopedProcedure');
    const end = src.indexOf('assignFill:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertOrphanedListLimit(input.limit)');
    expect(fn).toContain('limit: z.number().int().min(1).max(200).optional()');
    expect(fn).toContain('.slice(0, limit)');
    expect(fn).toContain('execution.orphaned_list_limit_unset');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/\?\? 100/);
    expect(fn).not.toMatch(/limit = 50/);
    expect(fn).not.toMatch(/emsStore\.list\(\)/);
  });

  it('omit / empty input refuses PRECONDITION_FAILED — never dumps both fills', async () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    const emsStore = new InMemoryEmsOrderStore();
    emsStore.record({
      clientOrderId: 'orphan-1',
      venueId: 'street',
      symbol: 'BTC/USDT',
      side: 'buy',
      execution: ack('1'),
    });
    emsStore.record({
      clientOrderId: 'orphan-2',
      venueId: 'street',
      symbol: 'ETH/USDT',
      side: 'sell',
      execution: ack('2'),
    });
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
      undefined,
      undefined,
      parentStore,
    ).createCaller(hmacSigned());

    await expect(caller.execution.oms.orphaned({})).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: /never invent 50/,
    });

    const page = await caller.execution.oms.orphaned({ limit: 1 });
    expect(page).toMatchObject({ ok: true });
    if (!page.ok) return;
    expect(page.fills).toHaveLength(1);

    const explicit50 = await caller.execution.oms.orphaned({ limit: 50 });
    expect(explicit50).toMatchObject({ ok: true });
    if (!explicit50.ok) return;
    expect(explicit50.fills).toHaveLength(2);
    expect(emsStore.list()).toHaveLength(2);

    const emptyEms = new InMemoryEmsOrderStore();
    const emptyCaller = createExecutionRouter(
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
      emptyEms,
      undefined,
      undefined,
      parentStore,
    ).createCaller(hmacSigned());
    await expect(emptyCaller.execution.oms.orphaned({ limit: 50 })).resolves.toEqual({ ok: true, fills: [] });
  });
});
