import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import {
  AFFILIATE_PRODUCER_PATH,
  affiliateLegAfterUsageFeeCharge,
  createAffiliateAccrueClient,
  fireAffiliateAccrue,
  NoopAffiliateAccrue,
  type AffiliateAgentsFeeLeg,
} from './affiliate-accrue.js';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET = 'test-internal-service-secret-32ch!!';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WINDOW = '2026-08-16T00';
const FEE = `agent.usage:${SESSION}:${WINDOW}`;

describe('agents affiliate accrue legs', () => {
  it('emits one fee-event keyed by feeCharge chargeId', () => {
    expect(
      affiliateLegAfterUsageFeeCharge({
        feeEventId: FEE,
        userId: USER,
        feeAmount: parseAmount('2.50'),
        feeAsset: 'IFC',
      }),
    ).toEqual([
      {
        userId: USER,
        feeAmount: parseAmount('2.50'),
        feeAsset: 'IFC',
        feeEventId: FEE,
      },
    ]);
  });

  it('skips zero fees', () => {
    expect(
      affiliateLegAfterUsageFeeCharge({
        feeEventId: FEE,
        userId: USER,
        feeAmount: 0n,
        feeAsset: 'IFC',
      }),
    ).toEqual([]);
  });
});

describe('fireAffiliateAccrue', () => {
  it('swallows a throw so the feeCharge stays posted', async () => {
    const port = {
      accrueAgentsFee: async () => {
        throw new Error('identity down');
      },
    };
    await expect(
      fireAffiliateAccrue(port, [
        {
          userId: USER,
          feeAmount: parseAmount('1'),
          feeAsset: 'IFC',
          feeEventId: FEE,
        },
      ]),
    ).resolves.toBeUndefined();
  });

  it('Noop never throws', async () => {
    await expect(fireAffiliateAccrue(new NoopAffiliateAccrue(), [])).resolves.toBeUndefined();
  });
});

describe('createAffiliateAccrueClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs v2-bound JSON with sourceModule agents; 412 is success', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = String(init.body);
      calls.push(body);
      expect(init.method).toBe('POST');
      expect(JSON.parse(body)).toEqual({
        feeEventId: FEE,
        userId: USER,
        feeAmount: '1',
        asset: 'IFC',
        sourceModule: 'agents',
      });
      expect(String(url)).toBe(`http://identity.example${AFFILIATE_PRODUCER_PATH}`);
      return new Response('{"code":"affiliate.accrual.rates_unset"}', { status: 412 });
    });
    const client = createAffiliateAccrueClient('http://identity.example', SECRET);
    await expect(
      client.accrueAgentsFee({
        userId: USER,
        feeAmount: parseAmount('1'),
        feeAsset: 'IFC',
        feeEventId: FEE,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('throws on 500 so fireAffiliateAccrue can swallow without unwinding', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    const client = createAffiliateAccrueClient('http://identity.example', SECRET);
    await expect(
      client.accrueAgentsFee({
        userId: USER,
        feeAmount: parseAmount('1'),
        feeAsset: 'IFC',
        feeEventId: FEE,
      } satisfies AffiliateAgentsFeeLeg),
    ).rejects.toThrow(/500/);
  });
});

describe('UsageMeter wires accrue after ledger post', () => {
  it('fires accrue after feeCharge, not before', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'metering/meter.ts'), 'utf8');
    expect(src).toMatch(/notifyAgentsAffiliateAccrue/);
    expect(src).toMatch(/recipes\.feeCharge/);
    expect(src.indexOf('recipes.feeCharge')).toBeLessThan(src.indexOf('notifyAgentsAffiliateAccrue'));
    const idx = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(idx).toMatch(/createAffiliateAccrueClient/);
  });
});
