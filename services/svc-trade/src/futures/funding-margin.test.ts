import { describe, expect, it } from 'vitest';
import { parseAmount as amt, formatAmount } from '@intafaced/ledger-client';
import { netFundingPaid, runFundingTick, memoryFundingPeriodStore, type FundingMarginApplier } from './funding-tick.js';
import type { FundingLeg } from './funding-settlement.js';
import type { PostRequest } from '@intafaced/ledger-client';

/**
 * After funding posts, margin_current must move with the money (mega-audit #3).
 * Without this, close/liq over-release open-time margin_initial.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function longShort() {
  return [
    {
      positionId: 'plong',
      userId: A,
      side: 'long' as const,
      size: amt('1'),
      entryPrice: amt('50000'),
      marginAsset: 'USDT',
    },
    {
      positionId: 'pshort',
      userId: B,
      side: 'short' as const,
      size: amt('1'),
      entryPrice: amt('50000'),
      marginAsset: 'USDT',
    },
  ];
}

describe('netFundingPaid', () => {
  it('nets payer +amount and payee −amount across legs', () => {
    const legs = [
      {
        payerPositionId: 'plong',
        payeePositionId: 'pshort',
        amount: amt('5'),
        recipe: {} as PostRequest,
      },
    ] as unknown as FundingLeg[];
    const nets = netFundingPaid(legs);
    expect(nets).toEqual(
      expect.arrayContaining([
        { positionId: 'plong', paid: amt('5') },
        { positionId: 'pshort', paid: -amt('5') },
      ]),
    );
  });
});

describe('runFundingTick applies margin nets after ledger post', () => {
  it('calls margins.applyFundingNets with payer/payee nets', async () => {
    const applied: { positionId: string; paid: bigint }[] = [];
    const margins: FundingMarginApplier = {
      async applyFundingNets(nets) {
        for (const n of nets) applied.push({ positionId: n.positionId, paid: n.paid });
      },
    };
    const posts: PostRequest[] = [];
    const result = await runFundingTick(
      {
        rates: {
          async quote({ marketId }) {
            return { rate: '0.0001', periodId: 'm1:period-margin', marketId };
          },
        },
        positions: {
          async listOpenForMarket() {
            return longShort();
          },
        },
        periods: memoryFundingPeriodStore(),
        ledger: {
          async post(req) {
            posts.push(req);
            return { id: 'tx', idempotencyKey: req.idempotencyKey } as never;
          },
        },
        margins,
      },
      'm1',
    );
    expect(result.status).toBe('settled');
    expect(posts.length).toBeGreaterThan(0);
    expect(applied.length).toBe(2);
    const longNet = applied.find((a) => a.positionId === 'plong')!;
    const shortNet = applied.find((a) => a.positionId === 'pshort')!;
    // Positive rate: long pays short.
    expect(longNet.paid > 0n).toBe(true);
    expect(shortNet.paid < 0n).toBe(true);
    expect(longNet.paid + shortNet.paid).toBe(0n);
    // amount is rate * notional = 0.0001 * 50000 = 5
    expect(formatAmount(longNet.paid)).toBe('5');
  });

  it('hands the applier the period id — the key its idempotency turns on', async () => {
    // The applier runs between an idempotent ledger post and the settle marker,
    // so a restart in that gap replays it. It cannot be idempotent on a key it
    // was never given.
    const seen: string[] = [];
    const margins: FundingMarginApplier = {
      async applyFundingNets(_nets, periodId) {
        seen.push(periodId);
      },
    };
    await runFundingTick(
      {
        rates: {
          async quote({ marketId }) {
            return { rate: '0.0001', periodId: 'm1:period-key', marketId };
          },
        },
        positions: {
          async listOpenForMarket() {
            return longShort();
          },
        },
        periods: memoryFundingPeriodStore(),
        ledger: {
          async post() {
            return undefined as never;
          },
        },
        margins,
      },
      'm1',
    );
    expect(seen).toEqual(['m1:period-key']);
  });

  it('skips margin apply when no legs (zero rate)', async () => {
    let called = 0;
    const margins: FundingMarginApplier = {
      async applyFundingNets() {
        called += 1;
      },
    };
    await runFundingTick(
      {
        rates: {
          async quote({ marketId }) {
            return { rate: '0', periodId: 'm1:zero', marketId };
          },
        },
        positions: {
          async listOpenForMarket() {
            return longShort();
          },
        },
        periods: memoryFundingPeriodStore(),
        ledger: {
          async post() {
            throw new Error('must not post');
          },
        },
        margins,
      },
      'm1',
    );
    expect(called).toBe(0);
  });
});
