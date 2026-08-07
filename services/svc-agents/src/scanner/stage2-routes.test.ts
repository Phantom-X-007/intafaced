import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';
import { SCANNER_DATA_TOOLS } from './guardrail.js';

const SECRET = 'an-agents-scanner-stage2-mount-test-edge-secret';
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
  matrix: { free: { maxSignals: 5, tools: [...SCANNER_DATA_TOOLS] } },
};

describe('scanner Stage-2 routes', () => {
  it('stage2Guardrail returns read-only spot tools', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).scanner.stage2Guardrail();
    expect(result.agentId).toBe('scanner');
    expect(result.tools.map((t) => t.name)).toEqual([...SCANNER_DATA_TOOLS]);
    expect(result.tools.every((t) => t.mode === 'read')).toBe(true);
    expect(result.limits.allowedTasks).toEqual(['scanner.rank']);
  });

  it('tierGate refuse-closed when law blank', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).scanner.tierGate({ userTier: 'free', law: null });
    expect(result).toEqual({
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
    });
  });

  it('invokeDataTool echoes ticker when live + published law', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.invokeDataTool({
        tool: 'trade.ticker',
        plane: 'live',
        userTier: 'free',
        law,
        now: '2026-08-07T12:00:00.000Z',
        ticker: {
          marketId: 'btc-usdt',
          last: '100',
          volume24h: '1000',
          change24hBps: 50,
          asOf: '2026-08-07T11:59:00.000Z',
          maxAgeMs: 120_000,
        },
      });
    expect(result).toEqual({
      status: 'ok',
      tool: 'trade.ticker',
      marketId: 'btc-usdt',
      last: '100',
      volume24h: '1000',
      change24hBps: 50,
      asOf: '2026-08-07T11:59:00.000Z',
    });
  });

  it('rankLive caps by tier depth and refuses invent on dark plane', async () => {
    const dark = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankLive({
        plane: 'dark',
        userTier: 'free',
        law,
        tickers: [
          {
            marketId: 'btc-usdt',
            last: '100',
            volume24h: '1000',
            change24hBps: 50,
            asOf: '2026-08-07T12:00:00.000Z',
            maxAgeMs: 60_000,
          },
        ],
      });
    expect(dark).toEqual({
      status: 'refuse',
      reason: 'market_plane_dark',
      userMessageKey: 'agents.scanner.unavailable',
    });

    const ok = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .scanner.rankLive({
        plane: 'live',
        userTier: 'free',
        law: {
          published: true,
          matrix: { free: { maxSignals: 1, tools: [...SCANNER_DATA_TOOLS] } },
        },
        now: '2026-08-07T12:00:00.000Z',
        tickers: [
          {
            marketId: 'btc-usdt',
            last: '100',
            volume24h: '100',
            change24hBps: 10,
            asOf: '2026-08-07T12:00:00.000Z',
            maxAgeMs: 60_000,
          },
          {
            marketId: 'eth-usdt',
            last: '50',
            volume24h: '5000',
            change24hBps: 200,
            asOf: '2026-08-07T12:00:00.000Z',
            maxAgeMs: 60_000,
          },
        ],
      });
    expect(ok.status).toBe('ok');
    if (ok.status !== 'ok') return;
    expect(ok.maxSignals).toBe(1);
    expect(ok.signals).toHaveLength(1);
    expect(ok.signals[0]?.marketId).toBe('eth-usdt');
  });
});
