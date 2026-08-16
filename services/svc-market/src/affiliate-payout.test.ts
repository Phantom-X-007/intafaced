import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import {
  AFFILIATE_PRODUCER_PAYOUT_PATH,
  createAffiliatePayoutClient,
  fireAffiliatePayout,
  NoopAffiliatePayout,
} from './affiliate-payout.js';

const VENDOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECRET = 'test-internal-service-secret-32ch!!';
const PURCHASE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FEE = `market.purchase:${PURCHASE}`;

const leg = {
  userId: VENDOR,
  feeAmount: parseAmount('1'),
  feeAsset: 'USDT',
  feeEventId: FEE,
};

describe('fireAffiliatePayout', () => {
  it('swallows a throw so the purchase stays posted', async () => {
    const port = {
      payoutMarketFee: async () => {
        throw new Error('identity down');
      },
    };
    await expect(fireAffiliatePayout(port, [leg])).resolves.toBeUndefined();
  });

  it('Noop never throws', async () => {
    await expect(fireAffiliatePayout(new NoopAffiliatePayout(), [leg])).resolves.toBeUndefined();
  });
});

describe('createAffiliatePayoutClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs { feeEventId } only — no amount, no rate', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = String(init.body);
      calls.push(body);
      expect(init.method).toBe('POST');
      expect(JSON.parse(body)).toEqual({ feeEventId: FEE });
      expect(Object.keys(JSON.parse(body))).toEqual(['feeEventId']);
      expect(String(url)).toBe(`http://identity.example${AFFILIATE_PRODUCER_PAYOUT_PATH}`);
      return new Response('{"posted":true}', { status: 200 });
    });
    const client = createAffiliatePayoutClient('http://identity.example', SECRET);
    await expect(client.payoutMarketFee(FEE)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('412 is success (rates unset / unpublished / frozen / nothing accrued)', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"code":"affiliate.payout.rates_unset"}', { status: 412 }));
    const client = createAffiliatePayoutClient('http://identity.example', SECRET);
    await expect(client.payoutMarketFee(FEE)).resolves.toBeUndefined();
  });

  it('throws on 500 so fireAffiliatePayout can swallow without unwinding', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    const client = createAffiliatePayoutClient('http://identity.example', SECRET);
    await expect(client.payoutMarketFee(FEE)).rejects.toThrow(/500/);
  });
});

/** Pin: purchase posts first, accrue second, payout third. */
describe('purchase wires payout after accrue after ledger post', () => {
  it('fires payout after accrue, after marketPurchase', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'commerce/commerce-service.ts'), 'utf8');
    expect(src).toMatch(/notifyMarketAffiliatePayout/);
    expect(src).toMatch(/notifyMarketAffiliateAccrue/);
    expect(src).toMatch(/recipes\.marketPurchase/);
    expect(src.indexOf('recipes.marketPurchase')).toBeLessThan(src.indexOf('notifyMarketAffiliateAccrue'));
    expect(src.indexOf('notifyMarketAffiliateAccrue')).toBeLessThan(src.indexOf('notifyMarketAffiliatePayout'));
    const idx = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(idx).toMatch(/createAffiliatePayoutClient/);
  });
});
