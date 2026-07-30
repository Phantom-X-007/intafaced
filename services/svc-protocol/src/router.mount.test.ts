import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createProtocolRouter } from './router.js';
import type { ProtocolRouterDeps } from './router.js';

/**
 * THE MOUNT BOUNDARY, for svc-protocol (docs/decisions/mount-boundary.md).
 *
 * The context comes from `createEdgeContext` over real headers, as `index.ts`
 * builds it, rather than from a `Context` literal that would keep passing on a
 * service that trusted an unsigned header.
 *
 * Worth being precise about what is and is not being defended here, because
 * this service is `custodial: false` on the `protocol` plane and most of its
 * surface is permissionless by design (§22). The signature buys nothing on
 * chain — no principal, forged or genuine, can move a user's assets, since the
 * only thing that authorises on this plane is a signature from the user's own
 * key. What it defends is the registry: `myAccounts` and `claimAccount` decide
 * WHOSE INTAFACED profile an address is attached to, and that is a question
 * about identity, not about custody.
 */

const SECRET = 'a-protocol-mount-test-edge-secret-length';
const USER = '11111111-1111-4111-8111-111111111111';
const CHAIN_ID = 31337;

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-protocol' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['protocol:read'],
    tier: 'none',
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

function forged(p: Principal = principal()) {
  return edgeContext({
    headers: { 'x-intafaced-principal': encodePrincipal(p), 'x-intafaced-region': 'DE' },
    id: 'req-forged',
  });
}

const ZERO = '0x0000000000000000000000000000000000000000';
const OWNER = '0x1111111111111111111111111111111111111111';
const FACTORY = '0x2222222222222222222222222222222222222222';
const IMPLEMENTATION = '0x3333333333333333333333333333333333333333';

function stubDeps(overrides: Partial<Record<string, unknown>> = {}): ProtocolRouterDeps {
  return {
    chain: {
      config: { chainId: CHAIN_ID, factory: ZERO, implementation: ZERO },
      isDeployed: async () => false,
    },
    registry: { accountsOf: async () => [] },
    relay: {
      buildDeployment: () => ({
        to: FACTORY,
        data: '0xdead',
        value: 0n,
        summary: 'deploy',
      }),
    },
    relayEnabled: () => true,
    ammFactoryAddress: () => ZERO as `0x${string}`,
    ...overrides,
  } as unknown as ProtocolRouterDeps;
}

describe('svc-protocol mount — authorisation', () => {
  it('refuses an anonymous caller on a scoped procedure, and reads nothing', async () => {
    let read = false;
    const deps = stubDeps({
      registry: {
        accountsOf: async () => {
          read = true;
          return [];
        },
      },
    });

    await expect(createProtocolRouter(deps).createCaller(anonymous()).myAccounts()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(read).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * An unsigned principal is anonymous, so a caller cannot read the registry as
   * somebody else — which on this plane is the only thing there is to steal.
   */
  it('refuses a self-asserted principal, however privileged it claims to be', async () => {
    const ctx = forged(principal({ scopes: ['protocol:read', 'admin:treasury'], tier: 'full', mfa: true }));
    expect(ctx.principal).toBeNull();

    await expect(createProtocolRouter(stubDeps()).createCaller(ctx).myAccounts()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a principal the edge signed, and reads that principal own accounts', async () => {
    let readFor: string | null = null;
    const deps = stubDeps({
      registry: {
        accountsOf: async (userId: string) => {
          readFor = userId;
          return [];
        },
      },
    });

    await expect(createProtocolRouter(deps).createCaller(signed()).myAccounts()).resolves.toEqual([]);
    expect(readFor).toBe(USER);
  });
});

describe('svc-protocol mount — the public surface', () => {
  it('serves health to an anonymous caller, and still says it is non-custodial', async () => {
    await expect(createProtocolRouter(stubDeps()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-protocol',
      chainId: CHAIN_ID,
      custodial: false,
      relayEnabled: true,
      factoryConfigured: false,
    });
  });

  it('serves health even when a forged principal was presented', async () => {
    await expect(createProtocolRouter(stubDeps()).createCaller(forged()).health()).resolves.toMatchObject({ ok: true });
  });

  it('reports factoryConfigured when factory and implementation are non-zero', async () => {
    const deps = stubDeps({
      chain: {
        config: { chainId: CHAIN_ID, factory: FACTORY, implementation: IMPLEMENTATION },
        isDeployed: async () => false,
      },
    });
    await expect(createProtocolRouter(deps).createCaller(anonymous()).health()).resolves.toMatchObject({
      factoryConfigured: true,
    });
  });

  it('refuses predictAddress when factory is zero', async () => {
    await expect(
      createProtocolRouter(stubDeps()).createCaller(anonymous()).predictAddress({ owner: OWNER }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('refuses buildDeployment when implementation is zero', async () => {
    const deps = stubDeps({
      chain: {
        config: { chainId: CHAIN_ID, factory: FACTORY, implementation: ZERO },
        isDeployed: async () => false,
      },
    });
    await expect(
      createProtocolRouter(deps).createCaller(anonymous()).buildDeployment({ owner: OWNER }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
