import { describe, expect, it, vi } from 'vitest';
import { parseFundingMarketIds, startFuturesJobs } from './futures-jobs.js';

describe('parseFundingMarketIds', () => {
  it('empty → no invent list', () => {
    expect(parseFundingMarketIds(undefined)).toEqual([]);
    expect(parseFundingMarketIds('')).toEqual([]);
    expect(parseFundingMarketIds('  ')).toEqual([]);
  });

  it('splits and trims', () => {
    expect(parseFundingMarketIds('m1, m2 ,m3')).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('startFuturesJobs', () => {
  it('disabled → no scheduled jobs (safe default)', () => {
    const handle = startFuturesJobs({
      sql: {} as never,
      ledger: { post: vi.fn() },
      matching: { depth: vi.fn() } as never,
      bus: null,
      config: {
        enabled: false,
        liqIntervalMs: 1000,
        fundingIntervalMs: 1000,
        fundingMarketIds: ['m1'],
      },
    });
    expect(handle.host.list()).toEqual([]);
    handle.stop();
  });

  it('enabled schedules liq + one funding job per market id', () => {
    const timers: string[] = [];
    // Intercept via createJobHost internals by checking list after start
    // Use real host with fake timers injected through a thin re-export path:
    // We only assert names on host.list after enable — use short intervals but
    // clear immediately so no real ticks fire against empty mocks.
    const handle = startFuturesJobs({
      sql: Object.assign((strings: TemplateStringsArray) => {
        const t = strings.join('').toLowerCase();
        if (t.includes('select')) return Promise.resolve([]);
        return Promise.resolve([]);
      }, {}) as never,
      ledger: { post: async () => ({ id: 'x' }) as never },
      matching: {
        depth: async () => ({ bids: [], asks: [], sequence: 0 }),
      } as never,
      bus: null,
      config: {
        enabled: true,
        liqIntervalMs: 60_000,
        fundingIntervalMs: 60_000,
        fundingMarketIds: ['m1', 'm2'],
      },
    });
    const names = handle.host.list().sort();
    expect(names).toContain('futures.liquidation');
    expect(names).toContain('futures.funding.m1');
    expect(names).toContain('futures.funding.m2');
    handle.stop();
    expect(handle.host.list()).toEqual([]);
    void timers;
  });
});
