import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-copy-intel-mount-test-edge-secret-long';
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

const fixture = {
  leaderId: 'leader-1',
  realisedPnl: '12.5',
  closedTrades: 10,
  winningTrades: 6,
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-07T00:00:00.000Z',
  source: 'platform-fixture',
};

describe('copyIntel.buildStats route (Stage-1 fixtures)', () => {
  it('builds audited stats from complete fixtures', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .copyIntel.buildStats({ fixtures: [fixture], now: '2026-08-07T12:00:00.000Z' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.stats[0]?.winRate).toBe('0.6000');
    expect(result.audit[0]?.provenance.fixture).toBe(true);
  });

  it('dark copy plane refuses invent PnL', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .copyIntel.buildStats({ fixtures: [fixture], copyPlane: 'dark' });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'copy_plane_dark' });
  });

  it('empty fixtures → empty (never invent leaders)', async () => {
    const result = await createAgentsRouter(stubDeps()).createCaller(signed()).copyIntel.buildStats({ fixtures: [] });
    expect(result).toEqual({ status: 'empty', userMessageKey: 'agents.copy_intel.empty' });
  });
});
