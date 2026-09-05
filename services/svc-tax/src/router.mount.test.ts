import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import {
  TAX_DATA_LAKE_UNAVAILABLE,
  TAX_DATA_LAKE_UNPROBED,
  TAX_EXPORT_INCOMPLETE,
  TAX_HISTORY_YEARS_UNSET,
  TAX_INDEXER_UNAVAILABLE,
  TAX_INDEXER_UNPROBED,
  TAX_JURISDICTION_UNMAPPED,
} from './codes.js';
import { createTaxRouter } from './router.js';
import { TaxService } from './tax-service.js';

const SECRET = 'a-tax-mount-test-edge-secret-long-enough';
const USER = '11111111-1111-4111-8111-111111111111';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-tax' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['tax:read', 'ledger:read'],
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

function emptyTax(mapRaw = '') {
  return new TaxService({
    mapRaw,
    reads: {
      async balances() {
        return [];
      },
      async history() {
        return [];
      },
    },
    lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
    indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
    historyYears: 10,
  });
}

describe('svc-tax router', () => {
  it('health is public and non-custodial', async () => {
    const api = createTaxRouter(emptyTax()).createCaller(await edgeContext({ headers: {}, id: 'anon' }));
    await expect(api.health()).resolves.toEqual({ ok: true, service: 'svc-tax', custodial: false });
  });

  it('blank map exportPack is PRECONDITION_FAILED tax.jurisdiction_unmapped', async () => {
    const api = createTaxRouter(emptyTax('')).createCaller(await signed());
    await expect(api.exportPack({ lotMethod: 'FIFO' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(TAX_JURISDICTION_UNMAPPED),
    });
  });

  it('unset history years is PRECONDITION_FAILED tax.history_years_unset', async () => {
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads: {
        async balances() {
          return [];
        },
        async history() {
          return [];
        },
      },
      lake: { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE },
      indexer: { status: 'absent', code: TAX_INDEXER_UNAVAILABLE },
    });
    const api = createTaxRouter(tax).createCaller(await signed());
    await expect(api.exportPack({ lotMethod: 'FIFO' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(TAX_HISTORY_YEARS_UNSET),
    });
  });

  it('mapped empty books return an empty pack with string amounts absent, not 0', async () => {
    const api = createTaxRouter(emptyTax('["DE"]')).createCaller(await signed());
    const pack = await api.exportPack({ lotMethod: 'HIFO' });
    expect(pack.empty).toBe(true);
    expect(pack.complete).toBe(false);
    expect(pack.realized).toBeNull();
    expect(pack.lotMethod).toBe('HIFO');
    expect(pack.bodyBase64.length).toBeGreaterThan(0);
    expect(pack.residuals).toContain(TAX_EXPORT_INCOMPLETE);
    expect(pack.lake.status).toBe('absent');
    expect(pack.indexer.status).toBe('absent');
    expect(JSON.stringify(pack)).not.toMatch(/"status":"ok"/);
  });

  it('exportPack complete:true is PRECONDITION_FAILED tax.export_incomplete', async () => {
    const api = createTaxRouter(emptyTax('["DE"]')).createCaller(await signed());
    await expect(api.exportPack({ lotMethod: 'FIFO', complete: true })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(TAX_EXPORT_INCOMPLETE),
    });
  });

  it('a set lake/indexer URL is configured, never ok on the pack', async () => {
    const tax = new TaxService({
      mapRaw: '["DE"]',
      reads: {
        async balances() {
          return [];
        },
        async history() {
          return [];
        },
      },
      lake: { status: 'configured', code: TAX_DATA_LAKE_UNPROBED },
      indexer: { status: 'configured', code: TAX_INDEXER_UNPROBED },
      historyYears: 10,
    });
    const api = createTaxRouter(tax).createCaller(await signed());
    const pack = await api.exportPack({ lotMethod: 'FIFO' });
    expect(pack.lake).toEqual({ status: 'configured', code: TAX_DATA_LAKE_UNPROBED });
    expect(pack.indexer).toEqual({ status: 'configured', code: TAX_INDEXER_UNPROBED });
    expect(JSON.stringify(pack)).not.toMatch(/"status":"ok"/);
  });
});
