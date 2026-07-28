import { describe, expect, it, beforeEach } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import { createIdentityRouter } from './router.js';
import { AuthError, type AuthService, type KycRecordView } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';

/**
 * The tRPC boundary for KYC and step-up.
 *
 * No database: the service is a stub, because what this file is about is
 * AUTHORITY, not the KYC state machine (`identity.test.ts` owns that against
 * real Postgres). The question here is the one the audit answered wrongly for
 * every account on the platform:
 *
 *   · `approveKyc` was reachable from nowhere, so nobody could ever be verified.
 *   · Now that it IS reachable, who is allowed to reach it?
 *
 * Approving a record grants access to every custodial module in the OS. A test
 * that only proves the happy path proves the more dangerous half is unguarded.
 */

const authConfig = {
  secret: 'an-identity-router-test-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const USER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';

async function ctx(scopes: string[], opts: { mfa?: boolean; userId?: string; region?: string } = {}): Promise<Context> {
  const region = opts.region ?? 'DE';
  if (scopes.length === 0) return { principal: null, service: null, region, requestId: 'req-1' };

  const { token } = await issueAccessToken(
    { userId: opts.userId ?? USER, sessionId: SESSION, scopes, tier: 'none', mfa: opts.mfa ?? true },
    authConfig,
  );
  return { principal: await verifyAccessToken(token, authConfig), service: null, region, requestId: 'req-1' };
}

// ── The stub ─────────────────────────────────────────────────────────────────

function kycRecord(overrides: Partial<KycRecordView> = {}): KycRecordView {
  return {
    id: RECORD,
    userId: USER,
    tier: 'basic',
    jurisdiction: 'DE',
    providerRef: 'provider-pointer-that-must-not-leak',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-07-27T12:00:00.000Z'),
    ...overrides,
  };
}

interface Stub {
  auth: AuthService;
  rank: RankService;
  calls: Array<{ method: string; args: unknown[] }>;
  fail(err: unknown): void;
}

function stubServices(): Stub {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let nextError: unknown = null;

  const record = <T>(method: string, result: (...args: never[]) => T) =>
    ((...args: never[]) => {
      calls.push({ method, args });
      if (nextError) {
        const err = nextError;
        nextError = null;
        return Promise.reject(err);
      }
      return Promise.resolve(result(...args));
    }) as never;

  const auth = {
    submitKyc: record('submitKyc', () => kycRecord()),
    listKycRecords: record('listKycRecords', () => [kycRecord()]),
    listPendingKyc: record('listPendingKyc', () => [kycRecord()]),
    kycTier: record('kycTier', () => 'none' as const),
    approveKycRecord: record('approveKycRecord', () =>
      kycRecord({ status: 'approved', reviewedBy: OPERATOR, reviewedAt: new Date('2026-07-28T09:00:00.000Z') }),
    ),
    rejectKycRecord: record('rejectKycRecord', () => kycRecord({ status: 'rejected', reviewedBy: OPERATOR })),
    stepUp: record('stepUp', () => ({
      accessToken: 'elevated.token.value',
      expiresAt: new Date('2026-07-28T09:05:00.000Z'),
      scopes: ['trade:withdraw'],
    })),
  } as unknown as AuthService;

  const rank = {} as unknown as RankService;

  return {
    auth,
    rank,
    calls,
    fail: (err) => {
      nextError = err;
    },
  };
}

let stub: Stub;
let router: ReturnType<typeof createIdentityRouter>;

beforeEach(() => {
  stub = stubServices();
  router = createIdentityRouter(stub.auth, stub.rank, { registrationOpen: true });
});

const caller = async (scopes: string[], opts?: Parameters<typeof ctx>[1]) => router.createCaller(await ctx(scopes, opts));
const codeOf = (err: unknown) => (err as { code?: string }).code;

// ── Who may grant trading access ─────────────────────────────────────────────

describe('kyc.approve is the operator action that grants custodial access', () => {
  it('serves an operator holding admin:compliance with a second factor', async () => {
    const api = await caller(['admin:compliance'], { userId: OPERATOR });
    await expect(api.kyc.approve({ recordId: RECORD })).resolves.toMatchObject({ id: RECORD, status: 'approved' });
  });

  it('REFUSES A NORMAL USER SESSION — every scope a session actually carries', async () => {
    // The exact scope list `AuthService.defaultScopes()` issues. If approving
    // ever becomes reachable from one of these, a user can verify themselves.
    const sessionScopes = [
      'identity:read',
      'identity:write',
      'ledger:read',
      'trade:read',
      'trade:write',
      'p2p:read',
      'p2p:write',
      'token:read',
      'token:stake',
      'academy:read',
      'agents:read',
    ];

    const api = await caller(sessionScopes);
    const err = await api.kyc.approve({ recordId: RECORD }).catch((e: unknown) => e);

    expect(codeOf(err)).toBe('FORBIDDEN');
    expect((err as Error).message).toContain('admin:compliance');
    expect(stub.calls.filter((c) => c.method === 'approveKycRecord')).toHaveLength(0);
  });

  it('refuses an anonymous caller', async () => {
    const api = await caller([]);
    await expect(api.kyc.approve({ recordId: RECORD })).rejects.toThrow(/Authentication required/);
  });

  it('does not accept a neighbouring operator scope', async () => {
    for (const scope of ['admin:read', 'admin:write', 'admin:treasury']) {
      const api = await caller([scope], { userId: OPERATOR });
      const err = await api.kyc.approve({ recordId: RECORD }).catch((e: unknown) => e);
      expect(codeOf(err)).toBe('FORBIDDEN');
    }
    expect(stub.calls.filter((c) => c.method === 'approveKycRecord')).toHaveLength(0);
  });

  it('REQUIRES A SECOND FACTOR, even with the right scope', async () => {
    // `admin:compliance` is NOT in INTERACTIVE_ONLY_SCOPES, so `requireScope`
    // does not demand mfa for it — this endpoint demands it itself. Approving a
    // record is a privilege-escalation primitive: a leaked operator credential
    // that can self-approve an account to `institutional` unlocks every
    // custodial module in the OS.
    const api = await caller(['admin:compliance'], { userId: OPERATOR, mfa: false });
    const err = await api.kyc.approve({ recordId: RECORD }).catch((e: unknown) => e);

    expect(codeOf(err)).toBe('UNAUTHORIZED');
    expect((err as Error).message).toMatch(/two-factor/i);
    expect(stub.calls.filter((c) => c.method === 'approveKycRecord')).toHaveLength(0);
  });

  it('records the CALLER as the reviewer, not anything the caller sent', async () => {
    const api = await caller(['admin:compliance'], { userId: OPERATOR });
    await api.kyc.approve({ recordId: RECORD });

    const call = stub.calls.find((c) => c.method === 'approveKycRecord')!;
    expect((call.args[0] as { reviewerId: string }).reviewerId).toBe(OPERATOR);
  });

  it('holds the same bar on reject', async () => {
    const unauthorised = await caller(['identity:write']);
    expect(codeOf(await unauthorised.kyc.reject({ recordId: RECORD }).catch((e: unknown) => e))).toBe('FORBIDDEN');

    const noMfa = await caller(['admin:compliance'], { userId: OPERATOR, mfa: false });
    expect(codeOf(await noMfa.kyc.reject({ recordId: RECORD }).catch((e: unknown) => e))).toBe('UNAUTHORIZED');

    const operator = await caller(['admin:compliance'], { userId: OPERATOR });
    await expect(operator.kyc.reject({ recordId: RECORD })).resolves.toMatchObject({ status: 'rejected' });
  });

  it('keeps the review queue behind the same scope', async () => {
    const user = await caller(['identity:read']);
    expect(codeOf(await user.kyc.pending().catch((e: unknown) => e))).toBe('FORBIDDEN');

    const operator = await caller(['admin:compliance'], { userId: OPERATOR });
    await expect(operator.kyc.pending()).resolves.toHaveLength(1);
  });

  it('maps a record that cannot be approved to CONFLICT, not to a 500', async () => {
    stub.fail(new AuthError('KYC record is rejected', 'auth.kyc_not_pending'));
    const api = await caller(['admin:compliance'], { userId: OPERATOR });
    expect(codeOf(await api.kyc.approve({ recordId: RECORD }).catch((e: unknown) => e))).toBe('CONFLICT');
  });

  it('maps an unknown record to NOT_FOUND', async () => {
    stub.fail(new AuthError('KYC record not found', 'auth.not_found'));
    const api = await caller(['admin:compliance'], { userId: OPERATOR });
    expect(codeOf(await api.kyc.approve({ recordId: RECORD }).catch((e: unknown) => e))).toBe('NOT_FOUND');
  });
});

// ── Submitting is the user's own act, and only their own ─────────────────────

describe('kyc.submit', () => {
  it('takes the user id from the token, so there is no id to tamper with', async () => {
    const api = await caller(['identity:write']);
    await api.kyc.submit({ tier: 'basic', jurisdiction: 'DE' });

    const call = stub.calls.find((c) => c.method === 'submitKyc')!;
    expect((call.args[0] as { userId: string }).userId).toBe(USER);
    // Stronger than an ownership check: an input the caller cannot supply
    // cannot be forged. `submit({ userId })` would need a guard; this needs none.
    expect(Object.keys(call.args[0] as object)).not.toContain('targetUserId');
  });

  it('needs identity:write — reading your own status is not asking to be verified', async () => {
    const api = await caller(['identity:read']);
    const err = await api.kyc.submit({ tier: 'basic', jurisdiction: 'DE' }).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('FORBIDDEN');
  });

  it('rejects a tier of "none" and a jurisdiction that is not ISO-3166 alpha-2', async () => {
    const api = await caller(['identity:write']);
    await expect(api.kyc.submit({ tier: 'none' as never, jurisdiction: 'DE' })).rejects.toThrow();
    await expect(api.kyc.submit({ tier: 'basic', jurisdiction: 'Germany' })).rejects.toThrow();
    await expect(api.kyc.submit({ tier: 'basic', jurisdiction: '' })).rejects.toThrow();
    expect(stub.calls.filter((c) => c.method === 'submitKyc')).toHaveLength(0);
  });

  it('normalises the jurisdiction, because the matrix is keyed on upper case', async () => {
    const api = await caller(['identity:write']);
    await api.kyc.submit({ tier: 'basic', jurisdiction: 'de' });

    const call = stub.calls.find((c) => c.method === 'submitKyc')!;
    expect((call.args[0] as { jurisdiction: string }).jurisdiction).toBe('DE');
  });
});

describe('kyc.status', () => {
  it('reports the caller’s own tier and records', async () => {
    const api = await caller(['identity:read']);
    const status = await api.kyc.status();

    expect(status.tier).toBe('none');
    expect(status.records).toHaveLength(1);
    expect(stub.calls.find((c) => c.method === 'listKycRecords')!.args[0]).toBe(USER);
  });

  it('NEVER RETURNS THE PROVIDER POINTER OR THE REVIEWER (§10 PII isolation)', async () => {
    const api = await caller(['identity:read']);
    const status = await api.kyc.status();

    // The provider ref points into a document store; the reviewer is a
    // compliance officer the subject of the review has no business naming.
    expect(JSON.stringify(status)).not.toContain('provider-pointer-that-must-not-leak');
    expect(status.records[0]).not.toHaveProperty('providerRef');
    expect(status.records[0]).not.toHaveProperty('reviewedBy');
  });
});

// ── Step-up ──────────────────────────────────────────────────────────────────

describe('auth.stepUp is what makes a withdrawal reachable at all', () => {
  it('elevates a live session and returns a token carrying trade:withdraw', async () => {
    const api = await caller(['identity:read']);
    const elevated = await api.auth.stepUp({ totpCode: '123456' });

    expect(elevated.scopes).toContain('trade:withdraw');
    expect(elevated.expiresAt).toBe('2026-07-28T09:05:00.000Z');
  });

  it('binds the elevation to the session in the token, not to anything sent', async () => {
    const api = await caller(['identity:read']);
    await api.auth.stepUp({ totpCode: '123456' });

    const call = stub.calls.find((c) => c.method === 'stepUp')!;
    expect(call.args[0]).toMatchObject({ userId: USER, sessionId: SESSION });
  });

  it('does not take a scope list from the caller', async () => {
    const api = await caller(['identity:read']);
    // An elevation endpoint that accepts a scope list is a scope-granting
    // endpoint. zod strips it; the assertion is that it never reaches the service.
    await api.auth.stepUp({ totpCode: '123456', scopes: ['admin:treasury'] } as never);

    const call = stub.calls.find((c) => c.method === 'stepUp')!;
    expect(Object.keys(call.args[0] as object)).toEqual(['userId', 'sessionId', 'totpCode']);
  });

  it('refuses an anonymous caller', async () => {
    const api = await caller([]);
    await expect(api.auth.stepUp({ totpCode: '123456' })).rejects.toThrow(/Authentication required/);
  });

  it('rejects a malformed code at the boundary', async () => {
    const api = await caller(['identity:read']);
    for (const totpCode of ['', '12345', '1234567', 'abcdef', ' 123456 ']) {
      await expect(api.auth.stepUp({ totpCode })).rejects.toThrow();
    }
    expect(stub.calls.filter((c) => c.method === 'stepUp')).toHaveLength(0);
  });

  it('tells "wrong code" apart from "you have no second factor"', async () => {
    stub.fail(new AuthError('Invalid two-factor code', 'auth.mfa_invalid'));
    const wrongCode = await caller(['identity:read']);
    expect(codeOf(await wrongCode.auth.stepUp({ totpCode: '123456' }).catch((e: unknown) => e))).toBe('UNAUTHORIZED');

    stub.fail(new AuthError('Enrol two-factor authentication before withdrawing', 'auth.mfa_not_enrolled'));
    const notEnrolled = await caller(['identity:read']);
    // FORBIDDEN, because retrying with another code cannot help — the client has
    // to send the user through enrolment, which is different UI.
    expect(codeOf(await notEnrolled.auth.stepUp({ totpCode: '123456' }).catch((e: unknown) => e))).toBe('FORBIDDEN');
  });

  it('maps a dead session to UNAUTHORIZED', async () => {
    stub.fail(new AuthError('Session is no longer valid', 'auth.session_invalid'));
    const api = await caller(['identity:read']);
    expect(codeOf(await api.auth.stepUp({ totpCode: '123456' }).catch((e: unknown) => e))).toBe('UNAUTHORIZED');
  });
});
