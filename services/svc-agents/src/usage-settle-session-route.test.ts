import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from './router.js';
import type { AgentsRouterDeps } from './router.js';
import type { SettlementResult } from './metering/meter.js';

/**
 * Unit card (L01 W6):
 * Promise: residual admin multi-window settle (W5 stop parked #3; README usage.settle is per-window).
 * Break: operator has no tRPC handle for `runtime.settleSession` without closing the session.
 * Done bar: `usage.settleSession` is HMAC as svc-agents, settles all open windows, returns decimal strings, refuses session-only callers.
 * Class: M (money path — feeCharge via existing settleSession only).
 */

const SECRET = 'an-agents-usage-settle-session-mount-test-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:write'],
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

function settleCaller(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-agents' as const };
}

function stubDeps(settleSession: (sessionId: string) => Promise<SettlementResult[]>): AgentsRouterDeps {
  return {
    runtime: {
      settleSession,
    } as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

describe('usage.settleSession route', () => {
  it('settles every open window and reports decimal amounts', async () => {
    const calls: string[] = [];
    const deps = stubDeps(async (sessionId) => {
      calls.push(sessionId);
      return [
        {
          sessionId,
          windowId: 'w1',
          chargeKey: `agent.usage:${sessionId}:w1`,
          amount: 12_500_000_000_000_000n, // 0.0125 IFC at 18 dec — bigint scaled
          chargeTxId: 'tx-1',
          settled: true,
        },
        {
          sessionId,
          windowId: 'w2',
          chargeKey: `agent.usage:${sessionId}:w2`,
          amount: 0n,
          chargeTxId: null,
          settled: true,
        },
      ];
    });

    const result = await createAgentsRouter(deps).createCaller(settleCaller()).usage.settleSession({ sessionId: SESSION });

    expect(calls).toEqual([SESSION]);
    expect(result.assetId).toBe('IFC');
    expect(result.settlements).toHaveLength(2);
    expect(result.settlements[0]).toMatchObject({
      windowId: 'w1',
      chargeKey: `agent.usage:${SESSION}:w1`,
      settled: true,
    });
    // Decimal string — never a number on the wire.
    expect(typeof result.settlements[0]!.amount).toBe('string');
    expect(result.settlements[0]!.amount).not.toMatch(/e/i);
    expect(result.settlements[1]).toMatchObject({ windowId: 'w2', amount: '0', settled: true });
  });

  it('returns an empty settlements list when nothing is open (idempotent re-sweep)', async () => {
    const deps = stubDeps(async () => []);
    const result = await createAgentsRouter(deps).createCaller(settleCaller()).usage.settleSession({ sessionId: SESSION });
    expect(result).toEqual({ assetId: 'IFC', settlements: [] });
  });

  it('refuses session-only admin:write (HMAC is the mill)', async () => {
    const deps = stubDeps(async () => {
      throw new Error('settleSession must not run without HMAC as svc-agents');
    });
    await expect(createAgentsRouter(deps).createCaller(signed()).usage.settleSession({ sessionId: SESSION })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('refuses HMAC as svc-trade', async () => {
    const deps = stubDeps(async () => {
      throw new Error('settleSession must not run as svc-trade');
    });
    await expect(
      createAgentsRouter(deps)
        .createCaller({ ...signed(), service: 'svc-trade' })
        .usage.settleSession({ sessionId: SESSION }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
