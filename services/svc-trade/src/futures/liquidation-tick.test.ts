import { describe, expect, it, vi } from 'vitest';
import { parseAmount as amt, type PostRequest } from '@intafaced/ledger-client';
import { memoryLiquidationAttemptStore, runLiquidationTick, type LiquidationPositionRow, type MarkSource } from './liquidation-tick.js';

const USER = '11111111-1111-4111-8111-111111111111';

function underwaterLong(): LiquidationPositionRow {
  // entry 100, size 1, margin 10 → at mark 80, uPnL=-20, equity=-10 → liquidate
  return {
    positionId: 'pos-1',
    userId: USER,
    side: 'long',
    size: amt('1'),
    entryPrice: amt('100'),
    margin: amt('10'),
    marginAsset: 'USDT',
    marketId: 'm1',
    symbol: 'BTC/USDT-PERP',
  };
}

function healthyLong(): LiquidationPositionRow {
  return {
    ...underwaterLong(),
    positionId: 'pos-healthy',
    entryPrice: amt('100'),
    margin: amt('50'),
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

function fixedMark(price: string | null): MarkSource {
  return {
    async markPrice() {
      return price;
    },
  };
}

describe('runLiquidationTick', () => {
  it('skips when mark source returns null (never invents)', async () => {
    const { ledger, posts } = recordingLedger();
    const closed: string[] = [];
    const result = await runLiquidationTick({
      marks: fixedMark(null),
      positions: {
        async listOpen() {
          return [underwaterLong()];
        },
      },
      closer: {
        async markLiquidated(id) {
          closed.push(id);
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      ledger,
    });
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.outcome).toBe('skipped_no_mark');
    expect(posts).toHaveLength(0);
    expect(closed).toHaveLength(0);
  });

  it('skips healthy positions', async () => {
    const { ledger, posts } = recordingLedger();
    const result = await runLiquidationTick({
      marks: fixedMark('100'), // mark = entry, equity = full margin
      positions: {
        async listOpen() {
          return [healthyLong()];
        },
      },
      closer: {
        async markLiquidated() {
          throw new Error('should not close');
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      ledger,
    });
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.outcome).toBe('skipped_healthy');
    expect(posts).toHaveLength(0);
  });

  it('liquidates underwater long: posts loss recipe + closer', async () => {
    const { ledger, posts } = recordingLedger();
    const closed: { id: string; reason: string }[] = [];
    const result = await runLiquidationTick({
      marks: fixedMark('80'),
      positions: {
        async listOpen() {
          return [underwaterLong()];
        },
      },
      closer: {
        async markLiquidated(id, meta) {
          closed.push({ id, reason: meta.reason });
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      ledger,
      now: () => new Date('2026-07-31T12:00:00.000Z'),
      liquidationIdFor: (row) => `liq-test:${row.positionId}`,
    });
    expect(result.liquidated).toBe(1);
    expect(result.items[0]!.outcome).toBe('liquidated');
    expect(posts.length).toBeGreaterThan(0);
    expect(closed).toEqual([{ id: 'pos-1', reason: expect.any(String) }]);
  });

  it('second tick same liquidationId is skipped_already', async () => {
    const attempts = memoryLiquidationAttemptStore();
    const { ledger, posts } = recordingLedger();
    const deps = {
      marks: fixedMark('80'),
      positions: {
        async listOpen() {
          return [underwaterLong()];
        },
      },
      closer: { async markLiquidated() {} },
      attempts,
      ledger,
      liquidationIdFor: () => 'liq-once',
    };
    await runLiquidationTick(deps);
    const second = await runLiquidationTick(deps);
    expect(second.items[0]!.outcome).toBe('skipped_already');
    // only first attempt posts
    expect(posts.length).toBeGreaterThan(0);
    const countAfterFirst = posts.length;
    await runLiquidationTick(deps);
    expect(posts).toHaveLength(countAfterFirst);
  });

  it('asks mark source with marketId + clock', async () => {
    const markPrice = vi.fn(async () => '80');
    const fixed = new Date('2026-07-31T12:00:00.000Z');
    const { ledger } = recordingLedger();
    await runLiquidationTick({
      marks: { markPrice },
      positions: {
        async listOpen() {
          return [underwaterLong()];
        },
      },
      closer: { async markLiquidated() {} },
      attempts: memoryLiquidationAttemptStore(),
      ledger,
      now: () => fixed,
    });
    expect(markPrice).toHaveBeenCalledWith({
      marketId: 'm1',
      symbol: 'BTC/USDT-PERP',
      at: fixed,
    });
  });
});
