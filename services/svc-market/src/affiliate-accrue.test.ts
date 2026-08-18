import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { mulBps, parseAmount } from '@intafaced/ledger-client';
import {
  AFFILIATE_PRODUCER_PATH,
  affiliateLegAfterMarketPurchase,
  createAffiliateAccrueClient,
  fireAffiliateAccrue,
  NoopAffiliateAccrue,
  type AffiliateMarketFeeLeg,
} from './affiliate-accrue.js';

const VENDOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET = 'test-internal-service-secret-32ch!!';
const PURCHASE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('market affiliate accrue legs', () => {
  it('emits one fee-event keyed by purchase id; feeAmount floors like the recipe', () => {
    const snapshotPrice = parseAmount('10');
    const snapshotBps = 500;
    expect(
      affiliateLegAfterMarketPurchase({
        purchaseId: PURCHASE,
        vendorUserId: VENDOR,
        snapshotPrice,
        snapshotBps,
        feeAsset: 'USDT',
      }),
    ).toEqual([
      {
        userId: VENDOR,
        feeAmount: mulBps(snapshotPrice, snapshotBps, 'floor'),
        feeAsset: 'USDT',
        feeEventId: `market.purchase:${PURCHASE}`,
      },
    ]);
  });

  it('skips zero fees', () => {
    expect(
      affiliateLegAfterMarketPurchase({
        purchaseId: PURCHASE,
        vendorUserId: VENDOR,
        snapshotPrice: parseAmount('10'),
        snapshotBps: 0,
        feeAsset: 'USDT',
      }),
    ).toEqual([]);
  });
});

describe('fireAffiliateAccrue', () => {
  it('swallows a throw so the purchase stays posted', async () => {
    const port = {
      accrueMarketFee: async () => {
        throw new Error('identity down');
      },
    };
    await expect(
      fireAffiliateAccrue(port, [
        {
          userId: VENDOR,
          feeAmount: parseAmount('1'),
          feeAsset: 'USDT',
          feeEventId: `market.purchase:${PURCHASE}`,
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

  it('POSTs v2-bound JSON with sourceModule market; 412 is success', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = String(init.body);
      calls.push(body);
      expect(init.method).toBe('POST');
      expect(JSON.parse(body)).toEqual({
        feeEventId: `market.purchase:${PURCHASE}`,
        userId: VENDOR,
        feeAmount: '1',
        asset: 'USDT',
        sourceModule: 'market',
      });
      expect(String(url)).toBe(`http://identity.example${AFFILIATE_PRODUCER_PATH}`);
      return new Response('{"code":"affiliate.accrual.rates_unset"}', { status: 412 });
    });
    const client = createAffiliateAccrueClient('http://identity.example', SECRET);
    await expect(
      client.accrueMarketFee({
        userId: VENDOR,
        feeAmount: parseAmount('1'),
        feeAsset: 'USDT',
        feeEventId: `market.purchase:${PURCHASE}`,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('throws on 500 so fireAffiliateAccrue can swallow without unwinding', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    const client = createAffiliateAccrueClient('http://identity.example', SECRET);
    await expect(
      client.accrueMarketFee({
        userId: VENDOR,
        feeAmount: parseAmount('1'),
        feeAsset: 'USDT',
        feeEventId: `market.purchase:${PURCHASE}`,
      } satisfies AffiliateMarketFeeLeg),
    ).rejects.toThrow(/500/);
  });
});

describe('purchase wires accrue after ledger post', () => {
  it('fires accrue after marketPurchase, not before', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'commerce/commerce-service.ts'), 'utf8');
    expect(src).toMatch(/notifyMarketAffiliateAccrue/);
    expect(src).toMatch(/recipes\.marketPurchase/);
    expect(src.indexOf('recipes.marketPurchase')).toBeLessThan(src.indexOf('notifyMarketAffiliateAccrue'));
    const idx = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(idx).toMatch(/createAffiliateAccrueClient/);
  });
});
