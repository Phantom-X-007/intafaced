import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { OPS_PAYROLL_INVENT_FORBIDDEN, OPS_WAREHOUSE_UNWIRED } from './codes.js';
import { OpsService } from './ops-service.js';
import { createOpsRouter } from './router.js';

const SECRET = 'a-ops-mount-test-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-ops' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['ops:read', 'ops:write'],
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

describe('svc-ops router', () => {
  it('health is public and non-custodial', async () => {
    const api = createOpsRouter(new OpsService()).createCaller(await edgeContext({ headers: {}, id: 'anon' }));
    await expect(api.health()).resolves.toEqual({ ok: true, service: 'svc-ops', custodial: false });
  });

  it('blank warehouse revenue is PRECONDITION_FAILED ops.warehouse_unwired', async () => {
    const api = createOpsRouter(new OpsService({ warehouseEnv: {} })).createCaller(await signed());
    await expect(api.revenue()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(OPS_WAREHOUSE_UNWIRED),
    });
  });

  it('createContact + projects.create round-trip; inventPayroll named forbidden', async () => {
    let n = 0;
    const api = createOpsRouter(
      new OpsService({
        id: () => `id-${++n}`,
        warehouseEnv: { ANALYTICS_REPLICA_CONFIGURED: 'true', ANALYTICS_REPLICA_LAG_SECONDS: '5' },
      }),
    ).createCaller(await signed());

    const contact = await api.createContact({ displayName: 'Ada', email: 'ada@example.com' });
    const listed = await api.contacts();
    expect(listed.contacts).toContainEqual(contact);

    const project = await api.projects.create({ title: 'Lane K' });
    const projects = await api.projects.list();
    expect(projects.projects).toEqual([project]);

    const emptyRev = await api.revenue();
    expect(emptyRev.empty).toBe(true);
    expect(emptyRev.points).toEqual([]);

    await expect(api.inventPayroll({})).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(OPS_PAYROLL_INVENT_FORBIDDEN),
    });
  });
});
