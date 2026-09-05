import { describe, expect, it } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import { createMerchantStateRouter } from './merchant-state-router.js';
import type { MerchantStateService, MerchantStatus, MerchantStatusChange, MerchantStatusEventRecord } from './merchant-state-service.js';

const authConfig = {
  secret: 'a-test-signing-secret-that-is-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const OPERATOR = '66666666-6666-4666-8666-666666666666';
const CONFIRM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MERCHANT = '55555555-5555-4555-8555-555555555555';

async function ctx(scopes: string[], opts: { mfa?: boolean; userId?: string } = {}): Promise<Context> {
  const { token } = await issueAccessToken(
    {
      userId: opts.userId ?? OPERATOR,
      sessionId: '77777777-7777-4777-8777-777777777777',
      scopes,
      tier: 'full',
      mfa: opts.mfa ?? true,
    },
    authConfig,
  );
  return {
    principal: await verifyAccessToken(token, authConfig),
    region: 'DE',
    requestId: 'req-1',
    service: null,
  };
}

function eventFor(to: MerchantStatus): MerchantStatusEventRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    seq: '1',
    merchantId: MERCHANT,
    fromStatus: 'active',
    toStatus: to,
    reason: 'fraud review',
    actorId: OPERATOR,
    actorScope: 'admin:write',
    createdAt: new Date('2026-09-05T12:00:00.000Z'),
  };
}

function stubState(calls: MerchantStatusChange[] = []): MerchantStateService {
  return {
    setStatus: async (change: MerchantStatusChange) => {
      calls.push(change);
      return { changed: true, event: eventFor(change.to) };
    },
    currentStatus: async () => 'suspended' as MerchantStatus,
    history: async () => [eventFor('suspended')],
  } as unknown as MerchantStateService;
}

describe('merchantState.set dual-control', () => {
  it('refuses without a second factor, even with admin:write — does not write', async () => {
    const calls: MerchantStatusChange[] = [];
    const caller = createMerchantStateRouter(stubState(calls)).createCaller(await ctx(['admin:write'], { mfa: false }));
    await expect(
      caller.merchantState.set({ merchantId: MERCHANT, to: 'suspended', reason: 'fraud review', confirmOperatorId: CONFIRM }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(calls).toEqual([]);
  });

  it('refuses missing or same-operator confirm — does not write', async () => {
    const calls: MerchantStatusChange[] = [];
    const caller = createMerchantStateRouter(stubState(calls)).createCaller(await ctx(['admin:write']));
    await expect(caller.merchantState.set({ merchantId: MERCHANT, to: 'suspended', reason: 'fraud review' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(
      caller.merchantState.set({ merchantId: MERCHANT, to: 'closed', reason: 'fraud review', confirmOperatorId: OPERATOR }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(calls).toEqual([]);
  });

  it('sets suspended and closed with MFA plus a distinct confirmer', async () => {
    const calls: MerchantStatusChange[] = [];
    const caller = createMerchantStateRouter(stubState(calls)).createCaller(await ctx(['admin:write']));
    await expect(
      caller.merchantState.set({ merchantId: MERCHANT, to: 'suspended', reason: 'fraud review', confirmOperatorId: CONFIRM }),
    ).resolves.toMatchObject({
      changed: true,
      status: 'suspended',
      confirmOperatorId: CONFIRM,
      event: { toStatus: 'suspended', actorId: OPERATOR },
    });
    await expect(
      caller.merchantState.set({ merchantId: MERCHANT, to: 'closed', reason: 'licence revoked', confirmOperatorId: CONFIRM }),
    ).resolves.toMatchObject({
      changed: true,
      confirmOperatorId: CONFIRM,
      event: { toStatus: 'closed' },
    });
    expect(calls.map((c) => c.to)).toEqual(['suspended', 'closed']);
    expect(calls.every((c) => c.actorId === OPERATOR && c.actorScope === 'admin:write')).toBe(true);
  });

  it('pay:write cannot set merchant state', async () => {
    const calls: MerchantStatusChange[] = [];
    const caller = createMerchantStateRouter(stubState(calls)).createCaller(await ctx(['pay:write']));
    await expect(
      caller.merchantState.set({ merchantId: MERCHANT, to: 'suspended', reason: 'fraud review', confirmOperatorId: CONFIRM }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toEqual([]);
  });

  it('history stays single-operator admin:read — no confirmer, no MFA', async () => {
    const caller = createMerchantStateRouter(stubState()).createCaller(await ctx(['admin:read'], { mfa: false }));
    await expect(caller.merchantState.history({ merchantId: MERCHANT, limit: 50 })).resolves.toEqual([
      {
        ...eventFor('suspended'),
        createdAt: '2026-09-05T12:00:00.000Z',
      },
    ]);
  });
});
