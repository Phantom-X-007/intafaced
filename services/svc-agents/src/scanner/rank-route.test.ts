import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL, SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW } from './signal-inputs-law.js';

/**
 * Stage-1 scanner is reachable from the tRPC surface with caller fixtures.
 * Does not invent markets; empty fixtures → empty; dark plane → unavailable;
 * blank P0-11 → refuse (D26-P1-A3).
 */

const SECRET = 'an-agents-scanner-mount-test-edge-secret-long';
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

describe('scanner.rankFixtures route (Stage-1)', () => {
  it('D26-P1-A3: omitted law refuse-closed on the wire (no sneak ranked board)', async () => {
    const now = '2026-08-07T12:00:00.000Z';
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankFixtures({
        now,
        fixtures: [
          {
            marketId: 'btc-usdt',
            last: '100',
            volume24h: '1000',
            change24hBps: 50,
            asOf: now,
            maxAgeMs: 60_000,
          },
        ],
      });
    expect(result).toEqual({
      status: 'refuse',
      reason: 'signal_inputs_law_blank',
      userMessageKey: 'agents.scanner.signal_inputs_closed',
      residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
    });
  });

  it('omitted limit refuses rank_limit_unset — never invent a 20-row board', async () => {
    const now = '2026-08-07T12:00:00.000Z';
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankFixtures({
        now,
        signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
        fixtures: [
          {
            marketId: 'btc-usdt',
            last: '100',
            volume24h: '1000',
            change24hBps: 50,
            asOf: now,
            maxAgeMs: 60_000,
          },
        ],
      });
    expect(result).toEqual({
      status: 'refuse',
      reason: 'rank_limit_unset',
      userMessageKey: 'agents.scanner.rank_limit_unset',
    });
  });

  it('owner-published 20 ranks complete fresh fixtures when P0-11 is sealed', async () => {
    const now = '2026-08-07T12:00:00.000Z';
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankFixtures({
        now,
        limit: 20,
        signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
        fixtures: [
          {
            marketId: 'btc-usdt',
            last: '100',
            volume24h: '1000',
            change24hBps: 50,
            asOf: now,
            maxAgeMs: 60_000,
          },
          {
            marketId: 'eth-usdt',
            last: '50',
            volume24h: '10',
            change24hBps: 10,
            asOf: now,
            maxAgeMs: 60_000,
          },
        ],
      });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.signals[0]?.marketId).toBe('btc-usdt');
    expect(result.signals).toHaveLength(2);
  });

  it('empty fixtures → empty (never invent signals)', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankFixtures({ fixtures: [], limit: 20, signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW });
    expect(result).toEqual({ status: 'empty', userMessageKey: 'agents.scanner.empty' });
  });

  it('dark market plane refuses invent', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankFixtures({
        marketPlane: 'dark',
        limit: 20,
        signalInputsLaw: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
        fixtures: [
          {
            marketId: 'btc-usdt',
            last: '100',
            volume24h: '1000',
            change24hBps: 50,
            asOf: new Date().toISOString(),
            maxAgeMs: 60_000,
          },
        ],
      });
    expect(result).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.scanner.unavailable',
      reason: 'market_plane_dark',
    });
  });
});
