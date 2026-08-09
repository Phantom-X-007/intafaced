import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-copy-intel-run-session-mount-test-secret';
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

const fixture = {
  leaderId: 'leader-a',
  realisedPnl: '12.5',
  closedTrades: 10,
  winningTrades: 6,
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
  source: 'platform-fills',
};

describe('copyIntel.runSession route', () => {
  it('refuses a dark copy plane without touching the runtime, and says it billed nothing', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .copyIntel.runSession({ plane: 'dark', fixtures: [fixture] });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'copy_plane_dark',
      userMessageKey: 'agents.copy_intel.unavailable',
    });
    expect(result.metering).toEqual({
      sessionId: null,
      billedAmount: '0',
      assetId: 'IFC',
      sessionClosed: false,
      settlements: [],
    });
  });

  it('is empty when no fixtures were supplied', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).copyIntel.runSession({ plane: 'live', fixtures: [] });

    expect(result).toMatchObject({ status: 'empty', userMessageKey: 'agents.copy_intel.empty' });
    expect(result.metering.billedAmount).toBe('0');
  });

  it('requires agents:execute', async () => {
    const readOnly = signed(principal({ scopes: ['agents:read'] }));
    await expect(
      createAgentsRouter(stubDeps())
        .createCaller(readOnly)
        .copyIntel.runSession({ plane: 'dark', fixtures: [fixture] }),
    ).rejects.toThrow();
  });
});
