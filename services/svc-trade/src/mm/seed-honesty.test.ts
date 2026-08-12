/**
 * D26-P1-T10 — Seed/mm honesty backend (coordinate trade.mm-bot).
 *
 * Done bar: seeded flagged; not in user volume; killable; no manufactured crosses.
 *
 * These proofs freeze the MM-path contract in `src/mm/**`. Spot placeOrder
 * SD-2…SD-5 suites remain in order-route-seed.test.ts; this file is the
 * house-MM / seedMarket limb Nitro's mm-bot residual shares.
 */
import { describe, expect, it } from 'vitest';
import { formatAmount, marketMakerOrderHoldAccount, MemoryLedger, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import type { EngineSubmitRequest, EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import {
  classifySeedSubmitResult,
  isHonestSeedSubmit,
  MM_SEED_ORDER_SEEDED,
  MM_SEED_ORDER_TYPE,
  MM_SEED_TIF,
  mmSeedJobsArmed,
  seedSubmitShape,
  seedVolumeCountsTowardUserStats,
} from './seed-honesty.js';
import { startMmSeedJobs } from './seed-jobs.js';
import { MM_MATCHING_ACCOUNT_ID, seedMarket, type SeededOrderRecord, type SeedTradableMarket } from './seed-market.js';

const ACTIVE_SPOT: SeedTradableMarket = { symbol: 'BTC/USDT', kind: 'spot', status: 'active' };

class HonestyStubMatching implements Pick<MatchingClient, 'submit' | 'depth' | 'cancel'> {
  readonly submitted: EngineSubmitRequest[] = [];
  private readonly scripts: Array<(req: EngineSubmitRequest) => EngineSubmitResult> = [];
  private seq = 0;

  script(fn: (req: EngineSubmitRequest) => EngineSubmitResult): this {
    this.scripts.push(fn);
    return this;
  }

  async depth() {
    return { bids: [] as [string, string][], asks: [] as [string, string][], sequence: 0 };
  }

  async cancel(_marketId: string, orderId: string) {
    return { cancelled: false, orderId, sequence: null, cancellation: null };
  }

  async submit(_marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push(request);
    const scripted = this.scripts.shift();
    if (scripted) return scripted(request);
    const sequence = ++this.seq;
    return {
      accepted: true,
      sequence,
      fills: [],
      resting: {
        kind: 'book',
        orderId: request.orderId,
        accountId: request.accountId,
        side: request.side,
        price: request.price ?? '0',
        remaining: request.qty,
        sequence,
      },
      rejected: null,
      cancellations: [],
      triggered: [],
    };
  }
}

async function fundBoth(ledger: MemoryLedger) {
  await ledger.post(recipes.marketMakerSeedFund({ assetId: 'USDT', amount: amt('100000'), seedId: 'h1' }));
  await ledger.post(recipes.marketMakerSeedFund({ assetId: 'BTC', amount: amt('100'), seedId: 'h2' }));
}

describe('D26-P1-T10 seed/mm honesty contract', () => {
  it('SD-2: seed placements are always flagged seeded', async () => {
    expect(MM_SEED_ORDER_SEEDED).toBe(true);
    const ledger = new MemoryLedger();
    await fundBoth(ledger);
    const matching = new HonestyStubMatching();
    const recorded: SeededOrderRecord[] = [];

    const result = await seedMarket(
      {
        marketId: '11111111-1111-4111-8111-111111111101',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        midPrice: '100',
        halfSpreadBps: 100,
        stepBps: 0,
        levels: 1,
        qtyPerLevel: '1',
        runId: 'honesty-flag',
      },
      {
        ledger,
        matching,
        market: ACTIVE_SPOT,
        recordSeededOrder: async (row) => {
          recorded.push(row);
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.placements.every((p) => p.seeded === true && p.status === 'resting')).toBe(true);
    expect(recorded.length).toBe(2);
    expect(recorded.every((r) => r.seeded === true)).toBe(true);
  });

  it('SD-3: seed volume never counts toward user stats', () => {
    expect(seedVolumeCountsTowardUserStats()).toBe(false);
  });

  it('SD-4: kill-switch — disabled or empty targets leave jobs unarmed', () => {
    expect(mmSeedJobsArmed(false, 3)).toBe(false);
    expect(mmSeedJobsArmed(true, 0)).toBe(false);
    expect(mmSeedJobsArmed(true, 2)).toBe(true);

    const dead = startMmSeedJobs({
      ledger: new MemoryLedger(),
      matching: new HonestyStubMatching(),
      midSource: () => '100',
      marketFor: () => ACTIVE_SPOT,
      config: {
        enabled: false,
        intervalMs: 1000,
        halfSpreadBps: 10,
        stepBps: 10,
        levels: 1,
        qtyPerLevel: '1',
        targets: [{ marketId: 'm', baseAsset: 'BTC', quoteAsset: 'USDT' }],
      },
    });
    expect(dead.host.list()).toEqual([]);
    dead.stop();
  });

  it('SD-5: seed submit shape is limit post-only under house MM', () => {
    const shaped = seedSubmitShape({
      orderId: 'o1',
      accountId: MM_MATCHING_ACCOUNT_ID,
      side: 'buy',
      qty: '1',
      price: '99',
    });
    expect(shaped.type).toBe(MM_SEED_ORDER_TYPE);
    expect(shaped.tif).toBe(MM_SEED_TIF);
    expect(isHonestSeedSubmit(shaped)).toBe(true);
    expect(isHonestSeedSubmit({ type: 'market', tif: 'IOC' })).toBe(false);
  });

  it('SD-5: synchronous fills on seed submit are manufactured crosses — hold released', async () => {
    const ledger = new MemoryLedger();
    await fundBoth(ledger);
    const matching = new HonestyStubMatching();
    // Both sides of a 1-level seed would submit; script fills on every submit.
    matching
      .script((req) => ({
        accepted: true,
        sequence: 1,
        fills: [
          {
            sequence: 1,
            makerOrderId: 'other',
            takerOrderId: req.orderId,
            price: req.price ?? '100',
            qty: req.qty,
            takerSide: req.side,
            makerAccountId: 'user:x',
            takerAccountId: MM_MATCHING_ACCOUNT_ID,
          },
        ],
        resting: null,
        rejected: null,
        cancellations: [],
        triggered: [],
      }))
      .script((req) => ({
        accepted: true,
        sequence: 2,
        fills: [
          {
            sequence: 2,
            makerOrderId: 'other2',
            takerOrderId: req.orderId,
            price: req.price ?? '100',
            qty: req.qty,
            takerSide: req.side,
            makerAccountId: 'user:x',
            takerAccountId: MM_MATCHING_ACCOUNT_ID,
          },
        ],
        resting: {
          kind: 'book',
          orderId: req.orderId,
          accountId: req.accountId,
          side: req.side,
          price: req.price ?? '0',
          remaining: '0.5',
          sequence: 2,
        },
        rejected: null,
        cancellations: [],
        triggered: [],
      }));

    const result = await seedMarket(
      {
        marketId: '11111111-1111-4111-8111-111111111102',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        midPrice: '100',
        halfSpreadBps: 100,
        stepBps: 0,
        levels: 1,
        qtyPerLevel: '1',
        runId: 'honesty-cross',
      },
      { ledger, matching, market: ACTIVE_SPOT },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_resting_orders');
    expect(result.placements.every((p) => p.status === 'manufactured_cross')).toBe(true);
    expect(result.placements.every((p) => p.seeded === true)).toBe(true);
    expect(matching.submitted.every((s) => isHonestSeedSubmit(s))).toBe(true);

    // Holds released — pot back, order-hold accounts empty.
    for (const p of result.placements) {
      const holdBal = await ledger.balance(marketMakerOrderHoldAccount(p.holdAsset, p.orderId));
      expect(holdBal.amount).toBe(0n);
    }
  });

  it('classifySeedSubmitResult: fills win over resting remnant', () => {
    expect(
      classifySeedSubmitResult({
        accepted: true,
        rejected: null,
        fills: [
          {
            sequence: 1,
            makerOrderId: 'm',
            takerOrderId: 't',
            price: '1',
            qty: '1',
            takerSide: 'buy',
            makerAccountId: 'a',
            takerAccountId: 'b',
          },
        ],
        resting: {
          kind: 'book',
          orderId: 't',
          accountId: 'b',
          side: 'buy',
          price: '1',
          remaining: '0.5',
          sequence: 1,
        },
      }),
    ).toEqual({ ok: false, kind: 'manufactured_cross', reason: 'seed_submit_produced_fills' });

    expect(
      classifySeedSubmitResult({
        accepted: true,
        rejected: null,
        fills: [],
        resting: {
          kind: 'book',
          orderId: 't',
          accountId: 'b',
          side: 'buy',
          price: '1',
          remaining: '1',
          sequence: 1,
        },
      }),
    ).toEqual({ ok: true, kind: 'resting' });
  });
});

describe('seedSubmitShape freezes make-only fields', () => {
  it('does not let callers override type/tif via spread tricks', () => {
    const shaped = seedSubmitShape({
      orderId: 'x',
      accountId: MM_MATCHING_ACCOUNT_ID,
      side: 'sell',
      qty: '2',
      price: '101',
    });
    expect(formatAmount(amt(shaped.qty))).toBe('2');
    expect(Object.keys(shaped).sort()).toEqual(['accountId', 'orderId', 'price', 'qty', 'side', 'tif', 'type'].sort());
  });
});
