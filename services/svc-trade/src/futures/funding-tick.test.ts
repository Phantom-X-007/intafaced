import { describe, expect, it, vi } from 'vitest';
import { parseAmount as amt, type PostRequest } from '@intafaced/ledger-client';
import { memoryFundingPeriodStore, runFundingTick, type FundingRateSource, type FundingPositionLoader } from './funding-tick.js';
import type { FundingOpenPosition } from './funding-settlement.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function longShort(): FundingOpenPosition[] {
  return [
    {
      positionId: 'plong',
      userId: A,
      side: 'long',
      size: amt('1'),
      entryPrice: amt('50000'),
      marginAsset: 'USDT',
    },
    {
      positionId: 'pshort',
      userId: B,
      side: 'short',
      size: amt('1'),
      entryPrice: amt('50000'),
      marginAsset: 'USDT',
    },
  ];
}

function fixedRate(rate: string, periodId = 'm1:2026-07-31T00:00:00Z'): FundingRateSource {
  return {
    async quote({ marketId }) {
      return { rate, periodId, marketId };
    },
  };
}

function positionsOf(rows: FundingOpenPosition[]): FundingPositionLoader {
  return {
    async listOpenForMarket() {
      return rows;
    },
  };
}

function recordingLedger() {
  const posts: PostRequest[] = [];
  return {
    posts,
    ledger: {
      async post(req: PostRequest) {
        posts.push(req);
        return { id: `tx-${posts.length}`, idempotencyKey: req.idempotencyKey } as never;
      },
    },
  };
}

describe('runFundingTick', () => {
  it('skips when rate source returns null (never invents)', async () => {
    const rates: FundingRateSource = {
      async quote() {
        return null;
      },
    };
    const { ledger, posts } = recordingLedger();
    const result = await runFundingTick(
      {
        rates,
        positions: positionsOf(longShort()),
        periods: memoryFundingPeriodStore(),
        ledger,
      },
      'm1',
    );
    expect(result).toEqual({ status: 'skipped', reason: 'no_rate' });
    expect(posts).toHaveLength(0);
  });

  it('skips when no open positions', async () => {
    const { ledger, posts } = recordingLedger();
    const result = await runFundingTick(
      {
        rates: fixedRate('0.0001'),
        positions: positionsOf([]),
        periods: memoryFundingPeriodStore(),
        ledger,
      },
      'm1',
    );
    expect(result.status).toBe('skipped');
    if (result.status === 'skipped') expect(result.reason).toBe('no_positions');
    expect(posts).toHaveLength(0);
  });

  it('posts funding legs for long/short book and marks period settled', async () => {
    const periods = memoryFundingPeriodStore();
    const { ledger, posts } = recordingLedger();
    const result = await runFundingTick(
      {
        rates: fixedRate('0.0001', 'm1:period-1'),
        positions: positionsOf(longShort()),
        periods,
        ledger,
      },
      'm1',
    );
    expect(result.status).toBe('settled');
    if (result.status === 'settled') {
      expect(result.periodId).toBe('m1:period-1');
      expect(result.legCount).toBe(1);
      expect(result.summary).toContain('1 leg');
    }
    expect(posts).toHaveLength(1);
    expect(posts[0]!.reason).toBe('futures.funding.paid');
    expect(await periods.isSettled('m1:period-1')).toBe(true);
  });

  it('second tick same period is already_settled (no double post)', async () => {
    const periods = memoryFundingPeriodStore();
    const { ledger, posts } = recordingLedger();
    const deps = {
      rates: fixedRate('0.0001', 'm1:period-2'),
      positions: positionsOf(longShort()),
      periods,
      ledger,
    };
    await runFundingTick(deps, 'm1');
    const second = await runFundingTick(deps, 'm1');
    expect(second).toEqual({ status: 'skipped', reason: 'already_settled', periodId: 'm1:period-2' });
    expect(posts).toHaveLength(1);
  });

  it('zero rate: no legs, marks settled so cron does not invent retry money', async () => {
    const periods = memoryFundingPeriodStore();
    const { ledger, posts } = recordingLedger();
    const result = await runFundingTick(
      {
        rates: fixedRate('0', 'm1:zero'),
        positions: positionsOf(longShort()),
        periods,
        ledger,
      },
      'm1',
    );
    expect(result).toEqual({ status: 'skipped', reason: 'no_legs', periodId: 'm1:zero' });
    expect(posts).toHaveLength(0);
    expect(await periods.isSettled('m1:zero')).toBe(true);
  });

  it('rate source is asked with marketId + clock (not invented inside tick)', async () => {
    const quote = vi.fn(async ({ marketId, at }: { marketId: string; at: Date }) => ({
      rate: '0.0001',
      periodId: `m1:${at.toISOString()}`,
      marketId,
    }));
    const fixed = new Date('2026-07-31T08:00:00.000Z');
    const { ledger } = recordingLedger();
    await runFundingTick(
      {
        rates: { quote },
        positions: positionsOf(longShort()),
        periods: memoryFundingPeriodStore(),
        ledger,
        now: () => fixed,
      },
      'm1',
    );
    expect(quote).toHaveBeenCalledWith({ marketId: 'm1', at: fixed });
  });
});
