import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-oms-census-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

function signed() {
  const p = {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
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

/** Live oms tRPC symbols on createExecutionRouter after the killBasket door. */
const LIVE_OMS_SYMBOLS = [
  'abandon',
  'accept',
  'approve',
  'assignFill',
  'attribute',
  'balances',
  'borrow',
  'cancel',
  'cancelRemaining',
  'claim',
  'confirmFill',
  'correctFill',
  'drain',
  'ems',
  'execute',
  'expire',
  'failedHedges',
  'fetch',
  'fill',
  'funding',
  'kill',
  'killBasket',
  'killParent',
  'killUnattended',
  'latency',
  'liveChildren',
  'manualFill',
  'markets',
  'openOrders',
  'orphaned',
  'ownership',
  'paper',
  'pass',
  'pause',
  'plan',
  'positions',
  'promote',
  'rails',
  'reject',
  'release',
  'releaseResidual',
  'repairHedge',
  'resume',
  'retryHedge',
  'scheduleSlice',
  'shift',
  'slice',
  'snapshot',
  'stage',
  'start',
  'startBasket',
  'stop',
  'tca',
  'timeoutPass',
  'unattended',
  'unclaim',
  'unconfirmed',
  'undeploy',
  'undeployDrain',
] as const;

function liveOmsTopLevelSymbols(): string[] {
  const procedures = createExecutionRouter(new SealedHouseTenantRegistry())._def.procedures;
  const prefix = 'execution.oms.';
  const names = new Set<string>();
  for (const key of Object.keys(procedures)) {
    if (!key.startsWith(prefix)) continue;
    const top = key.slice(prefix.length).split('.')[0];
    if (top) names.add(top);
  }
  return [...names].sort();
}

describe('A18 live oms census', () => {
  it('createExecutionRouter exposes the live oms symbol set and not a sliceBasket dual-implement', () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(signed());
    expect(typeof caller.execution.oms.startBasket).toBe('function');
    expect(typeof caller.execution.oms.killBasket).toBe('function');
    expect(typeof caller.execution.oms.slice).toBe('function');
    const symbols = liveOmsTopLevelSymbols();
    expect(symbols).toEqual([...LIVE_OMS_SYMBOLS].sort());
    expect(symbols).toContain('slice');
    expect(symbols).toContain('killParent');
    expect(symbols).toContain('startBasket');
    expect(symbols).toContain('killBasket');
    expect(symbols).not.toContain('sliceBasket');
  });
});
