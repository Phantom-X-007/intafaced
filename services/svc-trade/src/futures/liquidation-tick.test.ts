import { describe, expect, it, vi } from 'vitest';
import { parseAmount as amt, type PostRequest } from '@intafaced/ledger-client';
import {
  memoryLiquidationAttemptStore,
  runLiquidationTick,
  type LiquidationPositionRow,
  type MarkSource,
  type QuotedMarkSource,
} from './liquidation-tick.js';
import { DEFAULT_FUTURES_MARK_POLICY, type FuturesQuotedMark } from './mark-policy.js';

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

/**
 * THE GATES ON THE SEIZURE PATH.
 *
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md`, done bar items 3 and 4.
 * Every assertion below checks that NOTHING WAS POSTED and NOTHING WAS CLOSED,
 * not merely that an outcome string changed — a refusal that still moves money
 * is not a refusal.
 */
describe('runLiquidationTick — mark gates', () => {
  const AT = new Date('2026-08-06T12:00:00.000Z');

  /** An underwater long: at mark 80 its equity is -10, so nothing but the gate saves it. */
  function quotedMark(overrides: Partial<FuturesQuotedMark> = {}): QuotedMarkSource {
    return {
      async markPrice() {
        return '80';
      },
      async quote({ marketId, symbol }) {
        return { marketId, symbol, price: amt('80'), asOf: AT, quality: 'mid', ...overrides };
      },
    };
  }

  function missingMark(): QuotedMarkSource {
    return {
      async markPrice() {
        return null;
      },
      async quote() {
        return null;
      },
    };
  }

  async function tick(marks: MarkSource, extra: Partial<Parameters<typeof runLiquidationTick>[0]> = {}) {
    const { ledger, posts } = recordingLedger();
    const closed: string[] = [];
    const result = await runLiquidationTick({
      marks,
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
      now: () => AT,
      ...extra,
    });
    return { result, posts, closed };
  }

  it('liquidates an underwater long on a fresh mid mark (the control)', async () => {
    const { result, posts, closed } = await tick(quotedMark());
    expect(result.liquidated).toBe(1);
    expect(closed).toEqual(['pos-1']);
    expect(posts.length).toBeGreaterThan(0);
  });

  /** DONE BAR 3 — `last` cannot liquidate. */
  it('refuses to liquidate on a `last` mark, and nothing moves', async () => {
    const { result, posts, closed } = await tick(quotedMark({ quality: 'last' }));
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.outcome).toBe('skipped_mark_unusable');
    expect(result.items[0]!.reason).toBe('trade.mark_unusable');
    expect(result.items[0]!.summary).toContain('not a liquidation basis');
    expect(posts).toEqual([]);
    expect(closed).toEqual([]);
  });

  it('liquidates on `last` only when the policy is explicitly widened', async () => {
    const { result } = await tick(quotedMark({ quality: 'last' }), {
      markPolicy: { ...DEFAULT_FUTURES_MARK_POLICY, liquidationQualities: ['index', 'mid', 'last'] },
    });
    expect(result.liquidated).toBe(1);
  });

  /** DONE BAR 4 — a missing mark refuses to value, AND NO LIQUIDATION FOLLOWS. */
  it('a missing mark liquidates nobody — it is not a zero mark', async () => {
    const { result, posts, closed } = await tick(missingMark());
    expect(result.items[0]!.outcome).toBe('skipped_no_mark');
    expect(result.liquidated).toBe(0);
    expect(posts).toEqual([]);
    expect(closed).toEqual([]);
  });

  /**
   * The dangerous version of the same bug: a missing mark read as `0` makes
   * every long maximally underwater at once. Prove the tick never sees a zero
   * price by feeding it one explicitly and watching it refuse that too.
   */
  it('refuses an explicit zero mark rather than treating it as a price', async () => {
    const { result, posts, closed } = await tick(quotedMark({ price: 0n }));
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.outcome).toBe('skipped_mark_unusable');
    expect(result.items[0]!.reason).toBe('trade.mark_invalid');
    expect(posts).toEqual([]);
    expect(closed).toEqual([]);
  });

  it('refuses a mark stale past the liquidation limit while marking would still accept it', async () => {
    const stale = new Date(AT.getTime() - 90_000);
    const { result, posts } = await tick(quotedMark({ asOf: stale }));
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.summary).toContain('liquidation limit');
    expect(posts).toEqual([]);
  });

  it('does not liquidate through the deviation breaker', async () => {
    const { result, posts } = await tick(quotedMark(), {
      // Previous mark 200 → 80 is a 6000bps move, well past the 2000bps breaker.
      previousMarkFor: () => amt('200'),
    });
    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.summary).toContain('not liquidating through it');
    expect(posts).toEqual([]);
  });

  it('a source with no quote() still works — the gate is added, nothing is removed', async () => {
    const { result, posts } = await tick(fixedMark('80'));
    expect(result.liquidated).toBe(1);
    expect(posts.length).toBeGreaterThan(0);
  });
});
