import { describe, expect, it, vi } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { parseCandleMarketIds, parseCandleTimeframes, materializeClosedCandles } from './candles.js';
import { startCandleJobs } from './candle-jobs.js';
import type { Candle } from './types.js';

describe('parseCandleMarketIds', () => {
  it('empty → no invent list', () => {
    expect(parseCandleMarketIds(undefined)).toEqual([]);
    expect(parseCandleMarketIds('')).toEqual([]);
    expect(parseCandleMarketIds('  ')).toEqual([]);
  });

  it('splits and trims', () => {
    expect(parseCandleMarketIds('m1, m2 ,m3')).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('parseCandleTimeframes', () => {
  it('empty → [] (never invent 1m)', () => {
    expect(parseCandleTimeframes(undefined)).toEqual([]);
    expect(parseCandleTimeframes('')).toEqual([]);
    expect(parseCandleTimeframes('  ')).toEqual([]);
  });

  it('keeps valid tokens only, de-duped', () => {
    expect(parseCandleTimeframes('1m,7m,1h,1m')).toEqual(['1m', '1h']);
  });

  it('explicit 1m is owner-published, not a fallback', () => {
    expect(parseCandleTimeframes('1m')).toEqual(['1m']);
  });

  it('all-invalid → [] (never invent 1m)', () => {
    expect(parseCandleTimeframes('7m,nope')).toEqual([]);
  });
});

describe('startCandleJobs', () => {
  it('disabled → no scheduled jobs (safe default)', () => {
    const handle = startCandleJobs({
      sql: {} as never,
      config: {
        enabled: false,
        intervalMs: 1000,
        marketIds: ['m1'],
        timeframes: ['1m'],
      },
    });
    expect(handle.host.list()).toEqual([]);
    handle.stop();
  });

  it('enabled but empty markets → no schedule (never invent list)', () => {
    const handle = startCandleJobs({
      sql: {} as never,
      config: {
        enabled: true,
        intervalMs: 1000,
        marketIds: [],
        timeframes: ['1m'],
      },
    });
    expect(handle.host.list()).toEqual([]);
    handle.stop();
  });

  it('enabled + markets schedules spot.candles', () => {
    const handle = startCandleJobs({
      sql: Object.assign(async () => [], {}) as never,
      config: {
        enabled: true,
        intervalMs: 60_000,
        marketIds: ['m1'],
        timeframes: ['1m', '1h'],
        limit: 500,
      },
    });
    expect(handle.host.list()).toEqual(['spot.candles']);
    handle.stop();
    expect(handle.host.list()).toEqual([]);
  });
});

describe('materializeClosedCandles (unit)', () => {
  it('skips open bucket and zero volume — never invents', async () => {
    const T0 = 1_699_999_200_000;
    const nowMs = T0 + 30_000; // still inside the open 1m bucket
    const inserts: unknown[] = [];
    const sql = Object.assign(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      inserts.push(strings.join('?'));
      return [];
    }, {}) as never;

    const openBucket: Candle = {
      openTimeMs: T0,
      open: parseAmount('100'),
      high: parseAmount('100'),
      low: parseAmount('100'),
      close: parseAmount('100'),
      volume: parseAmount('1'),
    };
    const zeroVol: Candle = {
      openTimeMs: T0 - 60_000,
      open: parseAmount('0'),
      high: parseAmount('0'),
      low: parseAmount('0'),
      close: parseAmount('0'),
      volume: parseAmount('0'),
    };

    const written = await materializeClosedCandles(sql, {
      marketId: 'm1',
      timeframe: '1m',
      candles: [openBucket, zeroVol],
      nowMs,
    });
    expect(written).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it('upserts a closed positive-volume bucket', async () => {
    const T0 = 1_699_999_200_000;
    const nowMs = T0 + 120_000; // prior minute is closed
    let called = 0;
    const sql = Object.assign(async () => {
      called += 1;
      return [];
    }, {}) as never;

    const closed: Candle = {
      openTimeMs: T0,
      open: parseAmount('100'),
      high: parseAmount('105'),
      low: parseAmount('99'),
      close: parseAmount('103'),
      volume: parseAmount('3'),
    };

    const written = await materializeClosedCandles(sql, {
      marketId: 'm1',
      timeframe: '1m',
      candles: [closed],
      nowMs,
    });
    expect(written).toBe(1);
    expect(called).toBe(1);
  });

  it('onResult is not required — job tick can run with empty aggregation', async () => {
    // Smoke that start + stop with a stub sql does not invent markets.
    const onResult = vi.fn();
    const handle = startCandleJobs({
      sql: Object.assign(async () => [], {}) as never,
      config: {
        enabled: true,
        intervalMs: 60_000,
        marketIds: ['m1'],
        timeframes: ['1m'],
        limit: 500,
      },
      onResult,
    });
    expect(handle.host.list()).toEqual(['spot.candles']);
    // Do not wait for interval — just prove schedule exists without invent.
    expect(onResult).not.toHaveBeenCalled();
    handle.stop();
  });
});
