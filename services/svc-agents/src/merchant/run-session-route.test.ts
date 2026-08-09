import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

/**
 * `merchant.runSession` is mounted, scoped and shaped.
 *
 * The runtime is only reached on paths that open a session, so the refusal
 * cases below run against a deliberately empty runtime: if any of them touched
 * it, the test would throw rather than pass.
 */

const SECRET = 'an-agents-merchant-run-session-mount-test-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read', 'agents:execute'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

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

function stubDeps(): AgentsRouterDeps {
  return {
    runtime: {} as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

const point = {
  railId: 'card-visa',
  approvalRate: '0.70',
  attempts: 100,
  asOf: '2026-08-07T11:59:30.000Z',
  maxAgeMs: 120_000,
};

describe('merchant.runSession route', () => {
  it('refuses a dark pay plane without touching the runtime, and says it billed nothing', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .merchant.runSession({ plane: 'dark', points: [point] });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'pay_plane_dark',
      userMessageKey: 'agents.merchant.unavailable',
    });
    expect(result.metering).toEqual({
      sessionId: null,
      billedAmount: '0',
      assetId: 'IFC',
      sessionClosed: false,
      settlements: [],
    });
  });

  it('is empty when no points were supplied', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).merchant.runSession({ plane: 'live', points: [] });

    expect(result).toMatchObject({ status: 'empty', userMessageKey: 'agents.merchant.empty' });
    expect(result.metering.billedAmount).toBe('0');
  });

  it('requires agents:execute — a read-only principal cannot run a metered watch', async () => {
    const readOnly = signed(principal({ scopes: ['agents:read'] }));
    await expect(
      createAgentsRouter(stubDeps())
        .createCaller(readOnly)
        .merchant.runSession({ plane: 'dark', points: [point] }),
    ).rejects.toThrow();
  });
});
