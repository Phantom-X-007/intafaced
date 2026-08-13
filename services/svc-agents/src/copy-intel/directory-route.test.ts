import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-copy-intel-directory-route-test-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function signed() {
  const p = {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
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

const highPnl = {
  leaderId: 'zulu-leader',
  realisedPnl: '999.00',
  closedTrades: 50,
  winRate: '0.9000',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

const lowPnl = {
  leaderId: 'alpha-leader',
  realisedPnl: '-10.00',
  closedTrades: 5,
  winRate: '0.2000',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
};

describe('copyIntel.presentDirectory route (D26-P1-A5)', () => {
  it('returns directory ordered by leaderId, not PnL', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .copyIntel.presentDirectory({ stats: [highPnl, lowPnl] });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.presentation.rankedByReturns).toBe(false);
    expect(result.presentation.leaders.map((l) => l.leaderId)).toEqual(['alpha-leader', 'zulu-leader']);
  });

  it('refuses returns-ranked sort', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .copyIntel.presentDirectory({ stats: [highPnl, lowPnl], sortBy: 'pnl' });
    expect(result).toEqual({
      status: 'refuse',
      reason: 'returns_ranked_board',
      userMessageKey: 'agents.copy_intel.unavailable',
    });
  });

  it('refuses marketing board mode', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .copyIntel.presentDirectory({ stats: [highPnl], mode: 'leaderboard' });
    expect(result).toMatchObject({ status: 'refuse', reason: 'marketing_board' });
  });
});

describe('copyIntel.buildStats presentation (D26-P1-A5)', () => {
  it('ok buildStats carries directory presentation and leaderId order', async () => {
    const fixtures = [
      {
        leaderId: 'zulu-leader',
        realisedPnl: '999.00',
        closedTrades: 50,
        winningTrades: 45,
        windowStart: '2026-08-01T00:00:00.000Z',
        windowEnd: '2026-08-07T00:00:00.000Z',
        source: 'platform-fixture',
      },
      {
        leaderId: 'alpha-leader',
        realisedPnl: '-10.00',
        closedTrades: 5,
        winningTrades: 1,
        windowStart: '2026-08-01T00:00:00.000Z',
        windowEnd: '2026-08-07T00:00:00.000Z',
        source: 'platform-fixture',
      },
    ];
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).copyIntel.buildStats({ fixtures });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.presentation).toEqual({
      kind: 'directory',
      rankedByReturns: false,
      sortKey: 'leaderId',
    });
    expect(result.stats.map((s) => s.leaderId)).toEqual(['alpha-leader', 'zulu-leader']);
  });
});
