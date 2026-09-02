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

/** Live oms tRPC symbols on createExecutionRouter after the A3 basket hitch. */
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

describe('A18 live oms census', () => {
  it('createExecutionRouter exposes the live oms symbol set including startBasket', () => {
    const caller = createExecutionRouter(new SealedHouseTenantRegistry()).createCaller(signed());
    const symbols = Object.keys(caller.execution.oms).sort();
    expect(symbols).toEqual([...LIVE_OMS_SYMBOLS].sort());
    expect(symbols).toContain('startBasket');
    expect(symbols).toContain('slice');
    expect(symbols).toContain('killParent');
    expect(symbols).not.toContain('sliceBasket');
  });
});
