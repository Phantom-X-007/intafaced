import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createP2pRouter } from './router.js';
import type { P2pService } from './p2p-service.js';

/**
 * THE MOUNT BOUNDARY, for svc-p2p (docs/decisions/mount-boundary.md).
 *
 * Not a test of P2P behaviour — `p2p-service.test.ts` owns that. What this file
 * protects is the one property mounting `/trpc` depends on:
 *
 *   **reaching the port is not sufficient to become someone.**
 *
 * So it builds its context the way `index.ts` does — through `createEdgeContext`
 * over real request headers — rather than by handing the router a `Context`
 * object a test author wrote. A context literal would pass no matter how the
 * service derived its principal in production, which is precisely the bug the
 * decision exists to catch: it would still be green if `index.ts` went back to
 * `JSON.parse(req.headers['x-intafaced-principal'])`.
 *
 * `p2p` is `OPEN_BASIC` in the jurisdiction matrix, so `basic` is the tier floor
 * and neither `p2p:read` nor `p2p:write` is in `INTERACTIVE_ONLY_SCOPES`.
 */

const SECRET = 'a-p2p-mount-test-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-p2p' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['p2p:read'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

/** No credentials of any kind — a caller who simply found the port. */
const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

/** A principal the edge really vouched for. */
function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

/**
 * The forgery. A principal asserted by the caller, with no signature — exactly
 * what a hand-rolled `JSON.parse` context would have believed.
 */
function forged(p: Principal = principal()) {
  return edgeContext({
    headers: { 'x-intafaced-principal': encodePrincipal(p), 'x-intafaced-region': 'DE' },
    id: 'req-forged',
  });
}

function stubP2p(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listOffers: async () => [],
    ...overrides,
  } as unknown as P2pService;
}

describe('svc-p2p mount — authorisation', () => {
  it('refuses an anonymous caller on a scoped procedure, and reads nothing', async () => {
    // Shaped like the ledger's: it does not assert on a message, it asserts the
    // service was never asked to do the work.
    let read = false;
    const p2p = stubP2p({
      listOffers: async () => {
        read = true;
        return [];
      },
    });

    await expect(createP2pRouter(p2p).createCaller(anonymous()).offers.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(read).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * A caller who writes their own principal header gets nothing. If this fails,
   * the mount is trusting caller-supplied claims and every scope check in the
   * service — including the ones guarding escrow release — is decorative.
   */
  it('refuses a self-asserted principal, however privileged it claims to be', async () => {
    const ctx = forged(principal({ scopes: ['p2p:read', 'p2p:write', 'admin:treasury'], tier: 'full', mfa: true }));
    expect(ctx.principal).toBeNull();

    await expect(createP2pRouter(stubP2p()).createCaller(ctx).offers.list({})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a principal the edge signed', async () => {
    // Without this the UNAUTHORIZED assertions above would also pass on a
    // router that refuses everyone.
    await expect(createP2pRouter(stubP2p()).createCaller(signed()).offers.list({})).resolves.toEqual([]);
  });
});

describe('svc-p2p mount — the public surface', () => {
  it('serves health to an anonymous caller', async () => {
    await expect(createP2pRouter(stubP2p()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-p2p',
    });
  });

  it('serves health even when a forged principal was presented', async () => {
    // A rejected principal makes the caller anonymous, not rejected outright.
    await expect(createP2pRouter(stubP2p()).createCaller(forged()).health()).resolves.toMatchObject({ ok: true });
  });
});
