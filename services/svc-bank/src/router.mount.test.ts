import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createBankRouter } from './router.js';
import type { BankServices } from './bank-service.js';

/**
 * THE MOUNT BOUNDARY, for svc-bank (docs/decisions/mount-boundary.md).
 *
 * The context is built the way `index.ts` builds it — through
 * `createEdgeContext` over real headers — not as a `Context` literal. A literal
 * would keep passing if the service went back to trusting
 * `JSON.parse(req.headers['x-intafaced-principal'])`, which is the exact bug
 * this boundary exists to prevent. Every procedure here resolves
 * `ctx.principal.userId` into somebody's spaces and standing orders, so a
 * forgeable principal is a forgeable account holder.
 *
 * `bank` is `OPEN_FULL` in the jurisdiction matrix: `full` verification is the
 * floor, and the guard — not this service — is what enforces it.
 */

const SECRET = 'a-bank-mount-test-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-bank' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['bank:read'],
    tier: 'full',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

/** No credentials of any kind — a caller who simply found the port. */
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

/** A principal the caller wrote themselves. No signature. */
function forged(p: Principal = principal()) {
  return edgeContext({
    headers: { 'x-intafaced-principal': encodePrincipal(p), 'x-intafaced-region': 'DE' },
    id: 'req-forged',
  });
}

function stubBank(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    spaces: { unnamedAssets: async () => [], ...(overrides.spaces as object | undefined) },
    transfers: {
      runDueTransfers: async () => ({
        schedulesConsidered: 0,
        settled: 0,
        rejected: 0,
        alreadyFired: 0,
        strandedSwept: 0,
      }),
      ...(overrides.transfers as object | undefined),
    },
  } as unknown as BankServices;
}

describe('svc-bank mount — authorisation', () => {
  it('refuses an anonymous caller on a scoped procedure, and reads nothing', async () => {
    let read = false;
    const bank = stubBank({
      spaces: {
        unnamedAssets: async () => {
          read = true;
          return [];
        },
      },
    });

    await expect(createBankRouter(bank).createCaller(anonymous()).spaces.unnamed()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(read).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * `full` tier and `mfa: true` are both things an attacker would simply write
   * into the header. Unsigned, they buy nothing.
   */
  it('refuses a self-asserted principal, however privileged it claims to be', async () => {
    const ctx = forged(principal({ scopes: ['bank:read', 'bank:write', 'admin:treasury'], tier: 'full', mfa: true }));
    expect(ctx.principal).toBeNull();

    await expect(createBankRouter(stubBank()).createCaller(ctx).spaces.unnamed()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a principal the edge signed', async () => {
    await expect(createBankRouter(stubBank()).createCaller(signed()).spaces.unnamed()).resolves.toEqual([]);
  });
});

describe('svc-bank mount — the public surface', () => {
  it('serves health to an anonymous caller', async () => {
    await expect(createBankRouter(stubBank()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-bank',
    });
  });

  it('serves health even when a forged principal was presented', async () => {
    await expect(createBankRouter(stubBank()).createCaller(forged()).health()).resolves.toMatchObject({ ok: true });
  });
});

describe('svc-bank mount — ops.runDueTransfers kill switch', () => {
  const treasury = () => signed(principal({ scopes: ['admin:treasury'], tier: 'full', mfa: true }));

  it('refuses with SERVICE_UNAVAILABLE / bank.transfers_disabled when the flag is off, and never runs', async () => {
    let ran = false;
    const bank = stubBank({
      transfers: {
        runDueTransfers: async () => {
          ran = true;
          return {
            schedulesConsidered: 1,
            settled: 1,
            rejected: 0,
            alreadyFired: 0,
            strandedSwept: 0,
          };
        },
      },
    });

    await expect(
      createBankRouter(bank, { scheduledTransfersEnabled: false }).createCaller(treasury()).ops.runDueTransfers({}),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      cause: { code: 'bank.transfers_disabled' },
    });
    expect(ran).toBe(false);
  });

  it('runs when the flag is on', async () => {
    let ran = false;
    const bank = stubBank({
      transfers: {
        runDueTransfers: async () => {
          ran = true;
          return {
            schedulesConsidered: 0,
            settled: 0,
            rejected: 0,
            alreadyFired: 0,
            strandedSwept: 0,
          };
        },
      },
    });

    await expect(
      createBankRouter(bank, { scheduledTransfersEnabled: true }).createCaller(treasury()).ops.runDueTransfers({}),
    ).resolves.toMatchObject({ schedulesConsidered: 0, settled: 0 });
    expect(ran).toBe(true);
  });
});
