import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createBlueprintRouter } from './router.js';
import type { BlueprintService } from './blueprint-service.js';

/**
 * THE MOUNT BOUNDARY, for svc-blueprint (docs/decisions/mount-boundary.md).
 *
 * The context comes from `createEdgeContext` over real headers, exactly as
 * `index.ts` builds it — never a hand-written `Context` literal, which would go
 * on passing if the service started believing an unsigned header.
 *
 * This service has the sharpest version of the problem. Every procedure reads
 * `ctx.principal.userId` and there is deliberately no path that takes a userId
 * as input, because a Blueprint is the most personal object in the OS. That
 * design is only worth anything if the caller cannot choose whose userId ends
 * up on the context — so `export` and `erase` are exactly as safe as the
 * signature check, and no safer.
 *
 * `blueprint` is `minTier: 'none'` in the jurisdiction matrix: the guard's job
 * here is scope and region, not verification.
 */

const SECRET = 'a-blueprint-mount-test-edge-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const VICTIM = '99999999-9999-4999-8999-999999999999';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-blueprint' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['blueprint:read'],
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

function stubBlueprint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    get: async () => null,
    ...overrides,
  } as unknown as BlueprintService;
}

describe('svc-blueprint mount — authorisation', () => {
  it('refuses an anonymous caller on a scoped procedure, and reads nothing', async () => {
    let read = false;
    const blueprint = stubBlueprint({
      get: async () => {
        read = true;
        return null;
      },
    });

    await expect(createBlueprintRouter(blueprint).createCaller(anonymous()).me()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(read).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * The forged header names somebody else. If this ever passes, `me` is a
   * data-exfiltration endpoint for any account whose id an attacker can guess —
   * and `erase` is worse.
   */
  it('refuses a self-asserted principal naming another user, and reads nothing', async () => {
    let readFor: string | null = null;
    const blueprint = stubBlueprint({
      get: async ({ userId }: { userId: string }) => {
        readFor = userId;
        return null;
      },
    });

    const ctx = forged(principal({ sub: VICTIM, userId: VICTIM, scopes: ['blueprint:read', 'blueprint:write'] }));
    expect(ctx.principal).toBeNull();

    await expect(createBlueprintRouter(blueprint).createCaller(ctx).me()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(readFor).toBeNull();
  });

  it('accepts a principal the edge signed, and reads that principal own Blueprint', async () => {
    let readFor: string | null = null;
    const blueprint = stubBlueprint({
      get: async ({ userId }: { userId: string }) => {
        readFor = userId;
        return null;
      },
    });

    await expect(createBlueprintRouter(blueprint).createCaller(signed()).me()).resolves.toBeNull();
    expect(readFor).toBe(USER);
  });
});

describe('svc-blueprint mount — the public surface', () => {
  it('serves health to an anonymous caller', async () => {
    await expect(createBlueprintRouter(stubBlueprint()).createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-blueprint',
    });
  });

  it('serves health even when a forged principal was presented', async () => {
    await expect(createBlueprintRouter(stubBlueprint()).createCaller(forged()).health()).resolves.toMatchObject({ ok: true });
  });
});
