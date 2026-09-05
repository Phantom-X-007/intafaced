import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createPayRouter } from './router.js';
import type { PayService } from './payment-service.js';
import type { UserMoneyService } from './user-money-service.js';
import { RailRegistry } from './rails/registry.js';
import { CardSandboxAdapter } from './rails/card-sandbox.js';

/**
 * THE MOUNT BOUNDARY, for svc-pay (docs/decisions/mount-boundary.md).
 *
 * Not a test of payments maths — `router.test.ts` and the money-path suites own
 * that. What this file protects is the one property mounting `/trpc` depends on:
 *
 *   **reaching the port is not sufficient to become someone.**
 *
 * Context is built the way `index.ts` builds it — through `createEdgeContext`
 * over real request headers — not as a hand-written `Context` literal. A
 * literal would keep passing if the service went back to trusting
 * `JSON.parse(req.headers['x-intafaced-principal'])`, which is the exact bug
 * this boundary exists to prevent.
 *
 * `pay` is `OPEN_FULL` in the jurisdiction matrix: `full` verification is the
 * floor on every merchant procedure, and `admin:treasury` / `trade:withdraw`
 * (both interactive-only) sit on the user-money surface. A forgeable principal
 * is a forgeable merchant and a forgeable withdrawal.
 */

const SECRET = 'a-pay-mount-test-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-pay' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['pay:read'],
    tier: 'full',
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
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
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

const rails = new RailRegistry([new CardSandboxAdapter({ secret: 'pay-mount-test-rail-secret-at-least-32-chars', toleranceSeconds: 300 })]);

function stubPay(overrides: Partial<Record<string, unknown>> = {}) {
  return { ...overrides } as unknown as PayService;
}

function stubMoney(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listWithdrawals: async () => [],
    availableBalance: async () => 0n,
    ...overrides,
  } as unknown as UserMoneyService;
}

function router(pay: PayService = stubPay(), money: UserMoneyService = stubMoney()) {
  return createPayRouter(pay, rails, money);
}

describe('svc-pay mount — authorisation', () => {
  it('refuses an anonymous caller on a scoped procedure, and reads nothing', async () => {
    // railHealth only touches the registry; the assertion is still that a
    // scoped surface does not run for an unauthenticated caller.
    await expect(router().createCaller(anonymous()).railHealth()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * `full` tier, `mfa: true`, and `admin:treasury` are all things an attacker
   * would simply write into the header. Unsigned, they buy nothing — including
   * on the deposit surface that credits user balances.
   */
  it('refuses a self-asserted principal, however privileged it claims to be', async () => {
    const ctx = forged(
      principal({
        scopes: ['pay:read', 'pay:write', 'pay:refund', 'pay:payout', 'admin:treasury', 'trade:withdraw'],
        tier: 'full',
        mfa: true,
      }),
    );
    expect(ctx.principal).toBeNull();

    await expect(router().createCaller(ctx).railHealth()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts a principal the edge signed, and serves rail health', async () => {
    const health = await router().createCaller(signed()).railHealth();
    expect(health.some((h) => h.id === 'card-sandbox')).toBe(true);
  });

  it('serves a signed principal their own withdrawal list (user-money path)', async () => {
    let listedFor: string | null = null;
    const money = stubMoney({
      listWithdrawals: async (userId: string) => {
        listedFor = userId;
        return [];
      },
    });

    await expect(
      router(stubPay(), money)
        .createCaller(signed(principal({ scopes: ['trade:read'] })))
        .withdrawal.mine({}),
    ).resolves.toEqual([]);
    expect(listedFor).toBe(USER);
  });
});

describe('svc-pay mount — the public surface', () => {
  it('serves health to an anonymous caller, and names the registered rails', async () => {
    await expect(router().createCaller(anonymous()).health()).resolves.toEqual({
      ok: true,
      service: 'svc-pay',
      rails: ['card-sandbox'],
    });
  });

  it('serves health even when a forged principal was presented', async () => {
    // A rejected principal makes the caller anonymous, not rejected outright.
    await expect(router().createCaller(forged()).health()).resolves.toMatchObject({ ok: true });
  });
});
