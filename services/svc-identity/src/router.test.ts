import { describe, expect, it, beforeEach } from 'vitest';
import { SESSION_SCOPES, issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import { createIdentityRouter } from './router.js';
import { AuthError, type AuthService, type KycRecordView } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';
import { MemoryAccrualStore } from './affiliates/accrual-store.js';

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
    createApiKey: record('createApiKey', () => ({ id: 'key-1', key: 'ifc_secret', prefix: 'ifc_abc', mode: 'live' as const })),
    exchangeApiKey: record('exchangeApiKey', () => ({
      accessToken: 'api.key.jwt',
      expiresAt: new Date('2026-07-28T09:15:00.000Z'),
      userId: USER,
      keyId: '55555555-5555-4555-8555-555555555555',
      scopes: ['trade:read'],
      mode: 'live' as const,
    })),
    verifyApiKey: record('verifyApiKey', () => ({
      userId: USER,
      scopes: ['trade:read'],
      keyId: '55555555-5555-4555-8555-555555555555',
      mode: 'live' as const,
    })),
    startWebauthnRegistration: record('startWebauthnRegistration', () => ({
      challenge: 'chal-reg',
      rp: { name: 'INTAFACED', id: 'localhost' },
      user: { id: 'dXNlcg', name: 'u@example.com', displayName: 'user' },
      pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
      timeout: 60_000,
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'preferred' as const,
        userVerification: 'required' as const,
        requireResidentKey: false as const,
      },
      attestation: 'none' as const,
    })),
    confirmWebauthnRegistration: record('confirmWebauthnRegistration', () => ({ credentialId: 'cred-1' })),
    startWebauthnAuthentication: record('startWebauthnAuthentication', () => ({
      challenge: 'chal-auth',
      timeout: 60_000,
      rpId: 'localhost',
      allowCredentials: [{ type: 'public-key' as const, id: 'cred-1' }],
      userVerification: 'required' as const,
    })),
    confirmWebauthnAuthentication: record('confirmWebauthnAuthentication', () => ({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: new Date('2026-07-28T09:15:00.000Z'),
      sessionId: SESSION,
      userId: USER,
      mfaRequired: false,
    })),
    listWebauthnCredentials: record('listWebauthnCredentials', () => [{ credentialId: 'cred-1', createdAt: '2026-07-28T09:00:00.000Z' }]),
  } as unknown as AuthService;

  const rank = {
    awardXp: record('awardXp', () => ({
      snapshot: { rank: 1, xp: 100n },
      applied: true,
      rankChanged: false,
    })),
    perks: record('perks', () => ({ rank: 1, feeDiscountBps: 0, p2pLimitMultiplier: 1 })),
  } as unknown as RankService;

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

// ── rank.awardXp is service-only (full audit L2-2) ───────────────────────────

describe('rank.awardXp refuses user sessions, including defaultScopes()', () => {
  const award = {
    userId: USER,
    sourceModule: 'svc-p2p',
    action: 'trade.completed.seller',
    xpDelta: 50,
    idempotencyKey: 'idem-award-1-long-enough',
  };

  it('refuses a session that only holds identity:write', async () => {
    const api = await caller(['identity:write']);
    const err = await api.rank.awardXp(award).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('UNAUTHORIZED');
    expect(stub.calls.filter((c) => c.method === 'awardXp')).toHaveLength(0);
  });

  it('refuses the full default session scope list', async () => {
    const sessionScopes = [...SESSION_SCOPES];
    const api = await caller(sessionScopes);
    const err = await api.rank.awardXp(award).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('UNAUTHORIZED');
    expect(stub.calls.filter((c) => c.method === 'awardXp')).toHaveLength(0);
  });

  it('accepts a service caller with no user principal', async () => {
    const api = router.createCaller({
      principal: null,
      service: 'svc-p2p',
      region: 'DE',
      requestId: 'req-svc-1',
    });
    await expect(api.rank.awardXp(award)).resolves.toMatchObject({ applied: true, rank: 1 });
    expect(stub.calls.filter((c) => c.method === 'awardXp')).toHaveLength(1);
  });
});

// ── Who may grant trading access ─────────────────────────────────────────────

describe('kyc.approve is the operator action that grants custodial access', () => {
  it('serves an operator holding admin:compliance with a second factor', async () => {
    const api = await caller(['admin:compliance'], { userId: OPERATOR });
    await expect(api.kyc.approve({ recordId: RECORD })).resolves.toMatchObject({ id: RECORD, status: 'approved' });
  });

  it('REFUSES A NORMAL USER SESSION — every scope a session actually carries', async () => {
    // Read from SESSION_SCOPES rather than copied from it. A hand-kept copy
    // tests the list as it was on the day someone typed it out; this tests the
    // list as it is. If approving ever becomes reachable from one of these, a
    // user can verify themselves — including from a scope added next year.
    const sessionScopes = [...SESSION_SCOPES];

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

// ── WebAuthn ─────────────────────────────────────────────────────────────────

describe('webauthn registration requires a live session; auth is public', () => {
  const registrationBody = {
    id: 'cred-1',
    rawId: 'cred-1',
    type: 'public-key' as const,
    response: {
      clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
      attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YQ',
    },
  };

  const assertionBody = {
    identifier: 'alice',
    credential: {
      id: 'cred-1',
      rawId: 'cred-1',
      type: 'public-key' as const,
      response: {
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
        authenticatorData: 'authdata',
        signature: 'sig',
      },
    },
  };

  it('registerOptions is protected', async () => {
    await expect(caller([]).then((api) => api.webauthn.registerOptions())).rejects.toThrow(/Authentication required/);
    const api = await caller(['identity:read']);
    await expect(api.webauthn.registerOptions()).resolves.toMatchObject({ challenge: 'chal-reg' });
    expect(stub.calls.some((c) => c.method === 'startWebauthnRegistration')).toBe(true);
  });

  it('registerVerify binds the principal userId, never a body field', async () => {
    const api = await caller(['identity:write']);
    await expect(api.webauthn.registerVerify(registrationBody)).resolves.toEqual({ credentialId: 'cred-1' });
    const call = stub.calls.find((c) => c.method === 'confirmWebauthnRegistration')!;
    expect(call.args[0]).toBe(USER);
  });

  it('authOptions and authVerify are public and return a session', async () => {
    const anon = await caller([]);
    await expect(anon.webauthn.authOptions({ identifier: 'alice' })).resolves.toMatchObject({ challenge: 'chal-auth' });
    await expect(anon.webauthn.authVerify(assertionBody)).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      userId: USER,
    });
  });

  it('maps a bad ceremony to UNAUTHORIZED', async () => {
    stub.fail(new AuthError('signature verification failed', 'auth.webauthn_invalid'));
    const api = await caller(['identity:read']);
    expect(codeOf(await api.webauthn.registerVerify(registrationBody).catch((e: unknown) => e))).toBe('UNAUTHORIZED');
  });

  it('refuses every procedure when WebAuthn is disabled', async () => {
    router = createIdentityRouter(stub.auth, stub.rank, { registrationOpen: true, webauthnEnabled: false });
    const api = await caller(['identity:read']);
    expect(codeOf(await api.webauthn.registerOptions().catch((e: unknown) => e))).toBe('FORBIDDEN');
    expect(codeOf(await api.webauthn.authOptions({ identifier: 'alice' }).catch((e: unknown) => e))).toBe('FORBIDDEN');
    expect(stub.calls.filter((c) => c.method.startsWith('startWebauthn') || c.method.startsWith('confirmWebauthn'))).toHaveLength(0);
  });
});

// ── API keys are a delegation, not a wish list ───────────────────────────────

describe('apiKeys.create passes the GRANTING session as the ceiling', () => {
  const argsOf = (method: string) => stub.calls.filter((c) => c.method === method).map((c) => c.args[0] as Record<string, unknown>);

  it('reads the ceiling from the token, never from the request body', async () => {
    // The enforcement lives in `assertDelegatableScopes` and is tested in
    // packages/auth. What this asserts is the wiring, which is the half that
    // can silently regress: if `grantorScopes` ever comes from `input` — or
    // stops being passed at all — the check downstream has nothing to compare
    // against and any account can mint any scope again.
    const api = await caller(['identity:write', 'trade:read']);
    await api.apiKeys.create({ name: 'bot', scopes: ['trade:read'] });

    const [args] = argsOf('createApiKey');
    expect(args!.grantorScopes).toEqual(['identity:write', 'trade:read']);
    expect(args!.userId).toBe(USER);
  });

  it('cannot be widened by anything in the input', async () => {
    // A body naming its own grantor must not reach the service. `grantorScopes`
    // is spread AFTER `...input` in the router for exactly this reason.
    const api = await caller(['identity:write']);
    await api.apiKeys.create({ name: 'bot', scopes: ['identity:read'], grantorScopes: ['admin:compliance'] } as never);

    const [args] = argsOf('createApiKey');
    expect(args!.grantorScopes).toEqual(['identity:write']);
  });

  it('surfaces a refused delegation as BAD_REQUEST, not a 500', async () => {
    stub.fail(new Error('Cannot grant scopes the granting session does not hold: admin:compliance'));
    const api = await caller(['identity:write']);
    const err = await api.apiKeys.create({ name: 'escalate', scopes: ['admin:compliance'] }).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('BAD_REQUEST');
  });
});

describe('apiKeys.exchange turns a key into an edge-usable access token', () => {
  const argsOf = (method: string) => stub.calls.filter((c) => c.method === method).map((c) => c.args[0] as unknown);

  it('is public — no principal required', async () => {
    const api = createIdentityRouter(stub.auth, stub.rank, { registrationOpen: true }).createCaller(await ctx([]));
    const result = await api.apiKeys.exchange({ key: 'ifc_live_secret' });
    expect(result.accessToken).toBe('api.key.jwt');
    expect(result.userId).toBe(USER);
    expect(result.scopes).toEqual(['trade:read']);
    expect(argsOf('exchangeApiKey')).toEqual(['ifc_live_secret']);
  });

  it('maps a bad key to UNAUTHORIZED without leaking whether the key existed', async () => {
    stub.fail(new AuthError('Invalid credentials', 'auth.invalid_credentials'));
    const api = createIdentityRouter(stub.auth, stub.rank, { registrationOpen: true }).createCaller(await ctx([]));
    const err = await api.apiKeys.exchange({ key: 'ifc_wrong' }).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('UNAUTHORIZED');
  });
});

// ── Affiliates Stage: admin tree read + payout refuse-closed ─────────────────

describe('affiliates admin tree read (Stage spine, non-pay)', () => {
  const NODE = '55555555-5555-4555-8555-555555555555';
  const REF = '66666666-6666-4666-8666-666666666666';
  const CHILD = '77777777-7777-4777-8777-777777777777';

  function affiliatesRouter() {
    const frozen = new Set<string>([NODE]);
    const referral = {
      treeBoard: async (frozenIds?: ReadonlySet<string>) => ({
        edges: 2,
        referrers: 1,
        maxDepth: 2,
        frozenCount: frozenIds?.size ?? 0,
        maxDepthCap: 5,
      }),
      nodeStatus: async (userId: string, frozenIds?: ReadonlySet<string>) => ({
        userId,
        referrerId: REF,
        depth: 1,
        ancestors: [REF],
        directDownline: [],
        directDownlineCount: 0,
        frozen: frozenIds?.has(userId) ?? false,
        attributedAt: '2026-08-07T12:00:00.000Z',
      }),
      listMembers: async (frozenIds?: ReadonlySet<string>, rootId?: string | null) => {
        const members = [
          {
            userId: NODE,
            referrerId: REF,
            depth: 1,
            frozen: frozenIds?.has(NODE) ?? false,
            attributedAt: '2026-08-07T12:00:00.000Z',
          },
          {
            userId: CHILD,
            referrerId: NODE,
            depth: 2,
            frozen: frozenIds?.has(CHILD) ?? false,
            attributedAt: null,
          },
        ].filter((m) => !rootId || rootId === REF || (rootId === NODE && m.userId === CHILD));
        return {
          members,
          board: {
            total: members.length,
            frozenInList: members.filter((m) => m.frozen).length,
            maxDepthInList: members.reduce((max, m) => Math.max(max, m.depth), 0),
            rootId: rootId ?? null,
          },
        };
      },
    } as unknown as import('./affiliates/referral-service.js').ReferralService;

    const freeze = {
      frozenIds: async () => new Set(frozen),
      list: async () => [],
      freeze: async (input: { beneficiaryId: string; frozenBy: string; reason: string }) => {
        frozen.add(input.beneficiaryId);
        return {
          beneficiaryId: input.beneficiaryId,
          frozenBy: input.frozenBy,
          reason: input.reason,
          frozenAt: new Date('2026-08-07T16:00:00.000Z'),
        };
      },
      unfreeze: async (beneficiaryId: string) => {
        frozen.delete(beneficiaryId);
        return {
          beneficiaryId,
          frozenBy: OPERATOR,
          reason: 'prior',
          frozenAt: new Date('2026-08-07T15:00:00.000Z'),
        };
      },
    } as unknown as import('./affiliates/freeze-service.js').FreezeService;

    return createIdentityRouter(stub.auth, stub.rank, {
      registrationOpen: true,
      referral,
      freeze,
    });
  }

  it('treeStatus requires admin:read', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['identity:read']));
    const err = await api.affiliates.treeStatus().catch((e: unknown) => e);
    expect(codeOf(err)).toBe('FORBIDDEN');
  });

  it('treeStatus returns structure board for admin:read', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['admin:read'], { userId: OPERATOR }));
    const board = await api.affiliates.treeStatus();
    expect(board.edges).toBe(2);
    expect(board.frozenCount).toBe(1);
    expect(board.statusLine).toContain('edges=2');
    expect(board.statusLine).toContain('frozen=1');
  });

  it('node returns place-in-tree for admin:read', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['admin:read'], { userId: OPERATOR }));
    const node = await api.affiliates.node({ userId: NODE });
    expect(node.referrerId).toBe(REF);
    expect(node.depth).toBe(1);
    expect(node.frozen).toBe(true);
    expect(node.ancestors).toEqual([REF]);
  });

  it('members lists attributed roster for admin:read', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['admin:read'], { userId: OPERATOR }));
    const roster = await api.affiliates.members();
    expect(roster.total).toBe(2);
    expect(roster.frozenInList).toBe(1);
    expect(roster.members[0]?.userId).toBe(NODE);
    expect(roster.statusLine).toContain('total=2');
    const under = await api.affiliates.members({ rootId: NODE });
    expect(under.total).toBe(1);
    expect(under.members[0]?.userId).toBe(CHILD);
    expect(under.rootId).toBe(NODE);
  });

  it('members requires admin:read', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['identity:read']));
    const err = await api.affiliates.members().catch((e: unknown) => e);
    expect(codeOf(err)).toBe('FORBIDDEN');
  });

  it('freeze/unfreeze return honestyLine confirming set membership', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['admin:write'], { userId: OPERATOR }));
    const frozen = await api.affiliates.freeze({ beneficiaryId: CHILD, reason: 'ops hold' });
    expect(frozen.honestyLine).toContain('action=freeze');
    expect(frozen.honestyLine).toContain('ok=1');
    const thawed = await api.affiliates.unfreeze({ beneficiaryId: CHILD });
    expect(thawed.honestyLine).toContain('action=unfreeze');
    expect(thawed.honestyLine).toContain('ok=1');
  });

  it('payout is refuse-closed (PRECONDITION_FAILED) — no invent rates', async () => {
    const api = affiliatesRouter().createCaller(await ctx(['admin:write'], { userId: OPERATOR }));
    const err = await api.affiliates.payout({}).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('PRECONDITION_FAILED');
    expect(String((err as { message?: string }).message)).toContain('DIRECTION §8');
  });
});

// ── Affiliates residual: myAccruals self-only (durable rows, no invent) ───────

describe('affiliates.myAccruals (self-only durable accruals)', () => {
  const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const PAYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function withAccruals() {
    const store = new MemoryAccrualStore();
    return { store, router: createIdentityRouter(stub.auth, stub.rank, { registrationOpen: true, accruals: store }) };
  }

  it('returns only durable rows for the principal — never foreign beneficiary rows', async () => {
    const { store, router: r } = withAccruals();
    const at = new Date('2026-08-08T12:00:00.000Z');
    await store.saveRows([
      {
        feeEventId: 'fee-mine',
        beneficiaryId: USER,
        payerId: PAYER,
        hop: 0,
        rate: '0.10',
        feeAmount: '100',
        commissionAmount: '10',
        asset: 'USDT',
        accruedAt: at,
      },
      {
        feeEventId: 'fee-theirs',
        beneficiaryId: OTHER,
        payerId: PAYER,
        hop: 0,
        rate: '0.10',
        feeAmount: '50',
        commissionAmount: '5',
        asset: 'USDT',
        accruedAt: at,
      },
    ]);

    const api = r.createCaller(await ctx(['identity:read'], { userId: USER }));
    const out = await api.affiliates.myAccruals();
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.beneficiaryId).toBe(USER);
    expect(out.rows[0]!.commissionAmount).toBe('10');
    // Procedure has no beneficiaryId input — foreign list refused by design (self-only).
  });

  it('empty when no durable rows (does not invent rates or commissions)', async () => {
    const { router: r } = withAccruals();
    const api = r.createCaller(await ctx(['identity:read'], { userId: USER }));
    const out = await api.affiliates.myAccruals();
    expect(out.rows).toEqual([]);
  });

  it('requires identity:read', async () => {
    const { router: r } = withAccruals();
    const api = r.createCaller(await ctx([]));
    const err = await api.affiliates.myAccruals().catch((e: unknown) => e);
    expect(codeOf(err)).toBe('UNAUTHORIZED');
  });
});
