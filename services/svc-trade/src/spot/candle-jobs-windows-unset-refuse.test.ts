import { describe, expect, it } from 'vitest';
import { parseCandleTimeframes } from './candles.js';
import {
  CANDLE_JOBS_LIMIT_MAX,
  CandleJobsUnsetError,
  publishedCandleJobsLimit,
  startCandleJobs,
  TRADE_CANDLE_JOBS_LIMIT_UNSET,
  TRADE_CANDLE_JOBS_TIMEFRAMES_UNSET,
} from './candle-jobs.js';

describe('candle-job windows unset refuse (no invented 1m / 500)', () => {
  it('parseCandleTimeframes blank/unset/whitespace → [] not 1m', () => {
    expect(parseCandleTimeframes(undefined)).toEqual([]);
    expect(parseCandleTimeframes('')).toEqual([]);
    expect(parseCandleTimeframes('   ')).toEqual([]);
  });

  it('parseCandleTimeframes all-invalid → [] not fallback 1m', () => {
    expect(parseCandleTimeframes('7m,nope')).toEqual([]);
  });

  it('parseCandleTimeframes owner-explicit 1m is published', () => {
    expect(parseCandleTimeframes('1m')).toEqual(['1m']);
  });

  it('enabled + markets + empty timeframes throws trade.candle_jobs_timeframes_unset', () => {
    expect(() =>
      startCandleJobs({
        sql: {} as never,
        config: {
          enabled: true,
          intervalMs: 60_000,
          marketIds: ['m1'],
          timeframes: [],
          limit: 500,
        },
      }),
    ).toThrow(CandleJobsUnsetError);
    try {
      startCandleJobs({
        sql: {} as never,
        config: {
          enabled: true,
          intervalMs: 60_000,
          marketIds: ['m1'],
          timeframes: parseCandleTimeframes(''),
          limit: 500,
        },
      });
      expect.unreachable('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CandleJobsUnsetError);
      expect((err as CandleJobsUnsetError).code).toBe(TRADE_CANDLE_JOBS_TIMEFRAMES_UNSET);
    }
  });

  it('disabled + empty timeframes / unset limit does not throw (jobs stay off)', () => {
    const handle = startCandleJobs({
      sql: {} as never,
      config: {
        enabled: false,
        intervalMs: 60_000,
        marketIds: ['m1'],
        timeframes: [],
        limit: null,
      },
    });
    expect(handle.host.list()).toEqual([]);
    handle.stop();
  });

  it('enabled + empty markets + empty timeframes does not invent and does not throw', () => {
    const handle = startCandleJobs({
      sql: {} as never,
      config: {
        enabled: true,
        intervalMs: 60_000,
        marketIds: [],
        timeframes: [],
        limit: null,
      },
    });
    expect(handle.host.list()).toEqual([]);
    handle.stop();
  });

  it('enabled + markets + timeframes + unset limit throws trade.candle_jobs_limit_unset', () => {
    const run = (limit: number | null | undefined) =>
      startCandleJobs({
        sql: {} as never,
        config: {
          enabled: true,
          intervalMs: 60_000,
          marketIds: ['m1'],
          timeframes: ['1m'],
          limit,
        },
      });
    for (const limit of [undefined, null, 0, -1, 1001, 1.5]) {
      try {
        run(limit);
        expect.unreachable(`expected throw for limit=${String(limit)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(CandleJobsUnsetError);
        expect((err as CandleJobsUnsetError).code).toBe(TRADE_CANDLE_JOBS_LIMIT_UNSET);
      }
    }
  });

  it('owner-explicit 500 and 1 are published windows', () => {
    expect(publishedCandleJobsLimit(500)).toBe(500);
    expect(publishedCandleJobsLimit(1)).toBe(1);
    expect(publishedCandleJobsLimit(CANDLE_JOBS_LIMIT_MAX)).toBe(1000);
    const handle = startCandleJobs({
      sql: Object.assign(async () => [], {}) as never,
      config: {
        enabled: true,
        intervalMs: 60_000,
        marketIds: ['m1'],
        timeframes: ['1m'],
        limit: 500,
      },
    });
    expect(handle.host.list()).toEqual(['spot.candles']);
    handle.stop();
  });
});
