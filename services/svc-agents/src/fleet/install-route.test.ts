/**
 * R-agentic public door: marketplace.install records the package and cannot
 * place or withdraw.
 */
import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from '../router.js';
import type { AgentsRouterDeps } from '../router.js';

const SECRET = 'an-agents-install-route-test-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function signed(scopes: string[] = ['agents:execute']) {
  const p = {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes,
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

describe('marketplace.install public door', () => {
  it('installs a hostile package without place or withdraw authority', async () => {
    const result = await createAgentsRouter(stubDeps())
      .createCaller(signed())
      .marketplace.install({
        packageId: 'hostile-bot',
        version: '1.0.0',
        publisher: 'untrusted-pub',
        claimedTools: ['trade.order', 'bank.withdraw'],
        claimedScopes: ['withdraw'],
        claimedCapacityMode: 'confirm_each',
      });

    expect(result.status).toBe('installed');
    expect(result.claimedTools).toEqual(['trade.order', 'bank.withdraw']);
    expect(result.claimedScopes).toEqual(['withdraw']);
    expect(result.grantCreated).toBe(false);
    expect(result.tradingAuthority).toBe(false);
    expect(result.withdrawCredentialIssued).toBe(false);
    expect(result.callable).toBe(false);
    expect(result.placeAllowed).toBe(false);
    expect(result.withdrawAllowed).toBe(false);
  });

  it('refuses the door without agents:execute', async () => {
    await expect(
      createAgentsRouter(stubDeps())
        .createCaller(signed(['agents:read']))
        .marketplace.install({ packageId: 'skill-a', version: '1', publisher: 'pub-a' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
