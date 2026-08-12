import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { NAVIGATOR_DATA_TOOLS } from './data-tools.js';

const SECRET = 'an-agents-navigator-stage2-mount-test-edge-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
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

const law = {
  published: true as const,
  matrix: { free: [...NAVIGATOR_DATA_TOOLS] },
};

describe('navigator Stage-2 routes', () => {
  it('tierGate refuse-closed when law blank', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).navigator.tierGate({ userTier: 'free', law: null });
    expect(result).toEqual({
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.navigator.tier_closed',
    });
  });

  it('invokeDataTool echoes quote + audits execution', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .navigator.invokeDataTool({
        tool: 'trade.quote',
        plane: 'live',
        userTier: 'free',
        law,
        now: '2026-08-07T12:00:00.000Z',
        occurredAt: '2026-08-07T12:00:01.000Z',
        quote: {
          marketId: 'm1',
          last: '10.25',
          asOf: '2026-08-07T11:59:00.000Z',
          maxAgeMs: 120_000,
        },
      });
    expect(result.result).toEqual({
      status: 'ok',
      tool: 'trade.quote',
      marketId: 'm1',
      last: '10.25',
      asOf: '2026-08-07T11:59:00.000Z',
    });
    expect(result.audit).toMatchObject({
      sequence: 0,
      status: 'executed',
      tool: 'trade.quote',
      userMessageKey: 'agents.action.executed',
    });
  });

  it('invokeDataTool audits tier_law_blank refusal', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .navigator.invokeDataTool({
        tool: 'trade.quote',
        plane: 'live',
        userTier: 'free',
        law: { published: false },
        quote: {
          marketId: 'm1',
          last: '1',
          asOf: '2026-08-07T11:59:00.000Z',
          maxAgeMs: 60_000,
        },
        now: '2026-08-07T12:00:00.000Z',
        occurredAt: '2026-08-07T12:00:01.000Z',
      });
    expect(result.result).toMatchObject({ status: 'refuse', reason: 'tier_law_blank' });
    expect(result.audit.status).toBe('refused');
    expect(result.audit.reason).toBe('tier_law_blank');
  });

  it('invokeDataTool refuses another user identity session and audits the boundary', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .navigator.invokeDataTool({
        tool: 'identity.session.read',
        plane: 'live',
        userTier: 'free',
        law,
        session: {
          sessionId: 'session-other',
          userId: '99999999-9999-4999-8999-999999999999',
          status: 'open',
        },
        occurredAt: '2026-08-07T12:00:01.000Z',
      });
    expect(result.result).toMatchObject({ status: 'refuse', reason: 'subject_mismatch' });
    expect(result.audit).toMatchObject({ status: 'refused', reason: 'subject_mismatch' });
  });
});
