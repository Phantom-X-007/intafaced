import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount as amt } from '@intafaced/ledger-client';
import { planSeedQuotes, priceAtBps, summarizeSeedPlan } from './seed-planner.js';

describe('priceAtBps', () => {
  it('offsets mid by bps for buy/sell', () => {
    const mid = amt('100');
    // 100 bps = 1%
    expect(formatAmount(priceAtBps(mid, 100, 'sell'))).toBe('101');
    expect(formatAmount(priceAtBps(mid, 100, 'buy'))).toBe('99');
  });
});

describe('planSeedQuotes', () => {
  it('refuses missing mid (never invents)', () => {
    expect(planSeedQuotes({ midPrice: null, halfSpreadBps: 5, stepBps: 5, levels: 2, qtyPerLevel: '1' }).ok).toBe(false);
    expect(planSeedQuotes({ midPrice: '', halfSpreadBps: 5, stepBps: 5, levels: 2, qtyPerLevel: '1' }).ok).toBe(false);
    expect(planSeedQuotes({ midPrice: '0', halfSpreadBps: 5, stepBps: 5, levels: 2, qtyPerLevel: '1' }).ok).toBe(false);
  });

  it('builds two-sided levels from external mid', () => {
    const plan = planSeedQuotes({
      midPrice: '100',
      halfSpreadBps: 100, // 1%
      stepBps: 100,
      levels: 2,
      qtyPerLevel: '1.5',
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.intents).toHaveLength(4);
    const buys = plan.intents.filter((i) => i.side === 'buy');
    const sells = plan.intents.filter((i) => i.side === 'sell');
    expect(buys).toHaveLength(2);
    expect(sells).toHaveLength(2);
    // level1: 99 / 101; level2: 98 / 102
    expect(buys.map((b) => b.price).sort()).toEqual(['98', '99']);
    expect(sells.map((s) => s.price).sort()).toEqual(['101', '102']);
    expect(buys[0]!.qty).toBe('1.5');
    expect(summarizeSeedPlan(plan)).toContain('4 intents');
  });

  it('refuses invalid levels/qty/spread', () => {
    expect(planSeedQuotes({ midPrice: '100', halfSpreadBps: -1, stepBps: 1, levels: 1, qtyPerLevel: '1' }).ok).toBe(false);
    expect(planSeedQuotes({ midPrice: '100', halfSpreadBps: 1, stepBps: 1, levels: 0, qtyPerLevel: '1' }).ok).toBe(false);
    expect(planSeedQuotes({ midPrice: '100', halfSpreadBps: 1, stepBps: 1, levels: 1, qtyPerLevel: '0' }).ok).toBe(false);
  });
});
