import { afterEach, describe, expect, it } from 'vitest';
import { GET as warehouseGet, POST as warehousePost } from './analytics/warehouse/route';
import { GET as killSwitchGet, POST as killSwitchPost } from './kill-switch/route';
import { GET as ledgerFreezeGet, POST as ledgerFreezePost } from './ledger-freeze/route';
import { GET as operatorToolsGet, POST as operatorToolsPost } from './operator-tools/route';

const original = process.env.ADMIN_BFF_SHARED_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_BFF_SHARED_SECRET;
  else process.env.ADMIN_BFF_SHARED_SECRET = original;
});

const routes = [
  ['GET /api/analytics/warehouse', warehouseGet, 'GET'],
  ['POST /api/analytics/warehouse', warehousePost, 'POST'],
  ['GET /api/kill-switch', killSwitchGet, 'GET'],
  ['POST /api/kill-switch', killSwitchPost, 'POST'],
  ['GET /api/ledger-freeze', ledgerFreezeGet, 'GET'],
  ['POST /api/ledger-freeze', ledgerFreezePost, 'POST'],
  ['GET /api/operator-tools', operatorToolsGet, 'GET'],
  ['POST /api/operator-tools', operatorToolsPost, 'POST'],
] as const;

describe('every admin BFF route fails closed before handler work', () => {
  it.each(routes)('%s refuses blank auth configuration', async (_name, handler, method) => {
    delete process.env.ADMIN_BFF_SHARED_SECRET;
    const response = await handler(
      new Request('https://admin.example/api/proof', {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        body: method === 'POST' ? '{}' : undefined,
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'admin.bff_gate_unconfigured' });
  });

  it.each(routes)('%s refuses an invalid credential', async (_name, handler, method) => {
    process.env.ADMIN_BFF_SHARED_SECRET = 'correct-secret';
    const response = await handler(
      new Request('https://admin.example/api/proof', {
        method,
        headers: {
          'x-intafaced-admin-bff': 'wrong-secret',
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        },
        body: method === 'POST' ? '{}' : undefined,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'admin.bff_gate' });
  });
});
