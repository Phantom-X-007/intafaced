import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { SUPPORT_DATA_TOOLS } from './data-tools.js';

/**
 * `support.runSession` is mounted, scoped and shaped.
 *
 * The runtime is only reached on paths that open a session, so the refusal and
 * escalate cases below run against a deliberately empty runtime: if any of them
 * touched it, the test would throw rather than pass. That is the assertion — a
 * desk that stops for free must not have opened anything to find out.
 */

const SECRET = 'an-agents-support-run-session-mount-test-secret';
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

const law = { published: true as const, matrix: { free: [...SUPPORT_DATA_TOOLS] } };

const ask = {
  tool: 'support.kb.search',
  articles: [
    {
      articleKey: 'support.kb.withdrawal_hold',
      titleKey: 'support.kb.withdrawal_hold.title',
      bodyKey: 'support.kb.withdrawal_hold.body',
    },
  ],
};

describe('support.runSession route', () => {
  it('refuses a dark desk without touching the runtime, and says it billed nothing', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .support.runSession({ plane: 'dark', userTier: 'free', law, asks: [ask] });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'desk_plane_dark',
      userMessageKey: 'agents.support.unavailable',
    });
    expect(result.metering).toEqual({
      sessionId: null,
      billedAmount: '0',
      assetId: 'IFC',
      sessionClosed: false,
      settlements: [],
    });
  });

  it('refuses a blank tier law refuse-closed', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .support.runSession({ plane: 'live', userTier: 'free', law: null, asks: [ask] });

    expect(result).toMatchObject({
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.support.tier_closed',
    });
    expect(result.metering.sessionId).toBeNull();
  });

  it('escalates a money request to a person, free, without a session', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .support.runSession({ plane: 'live', userTier: 'free', law, moneyRequest: true, asks: [ask] });

    expect(result).toMatchObject({
      status: 'escalate',
      reason: 'money_request',
      userMessageKey: 'agents.support.escalated',
    });
    expect(result.metering.billedAmount).toBe('0');
    if (result.status !== 'escalate') return;
    expect(result.caseFile.moneyRequest).toBe(true);
    expect(result.caseFile.reason).toBe('money_request');
  });

  it('is empty when nothing was asked', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .support.runSession({ plane: 'live', userTier: 'free', law, asks: [] });

    expect(result).toMatchObject({ status: 'empty', userMessageKey: 'agents.support.empty' });
    expect(result.metering.billedAmount).toBe('0');
  });

  it('requires agents:execute — a read-only principal cannot run a metered reply', async () => {
    const readOnly = signed(principal({ scopes: ['agents:read'] }));
    await expect(
      createAgentsRouter(stubDeps())
        .createCaller(readOnly)
        .support.runSession({
          plane: 'dark',
          userTier: 'free',
          law,
          asks: [ask],
        }),
    ).rejects.toThrow();
  });

  it('caps the ask list rather than letting a caller burn a session budget', async () => {
    const asks = Array.from({ length: 21 }, () => ask);
    await expect(
      createAgentsRouter(stubDeps()).createCaller(signed()).support.runSession({ plane: 'dark', userTier: 'free', law, asks }),
    ).rejects.toThrow();
  });
});
