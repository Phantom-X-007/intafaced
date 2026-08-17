import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { createExecutionRouter } from './router.js';

const SECRET = 'a-execution-mount-test-edge-secret-long';
const OP = '33333333-3333-4333-8333-333333333333';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });

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

describe('execution.tenant tRPC', () => {
  it('refuses anonymous kill', async () => {
    const router = createExecutionRouter(new SealedHouseTenantRegistry());
    await expect(router.createCaller(anonymous()).execution.tenant.kill({ tenantId: 'house-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('describe + kill are reachable; kill blocks later authorize', async () => {
    const registry = new SealedHouseTenantRegistry();
    registry.register('house-1', 'seed');
    const caller = createExecutionRouter(registry).createCaller(signed());

    const before = await caller.execution.tenant.describe({ tenantId: 'house-1' });
    expect(before).toMatchObject({ tenantId: 'house-1', killed: false });

    await caller.execution.tenant.kill({ tenantId: 'house-1' });
    const after = await caller.execution.tenant.describe({ tenantId: 'house-1' });
    expect(after).toMatchObject({ killed: true });

    const auth = registry.authorize('house-1', { kind: 'external', venueId: 'ext-1' }, 'bot');
    expect(auth).toMatchObject({ ok: false, reason: 'kill_switch' });
  });

  it('package refuse for matching-book is independent of the router', () => {
    const registry = new SealedHouseTenantRegistry();
    registry.register('house-1', 'seed');
    expect(registry.authorize('house-1', { kind: 'matching-book' }, 'bot')).toMatchObject({
      ok: false,
      reason: 'internal_venue',
    });
  });
});
