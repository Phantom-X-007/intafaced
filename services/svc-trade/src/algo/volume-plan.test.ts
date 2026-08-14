import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { TradeError } from '../spot/types.js';
import type { Candle } from '../spot/types.js';
import { alignLookbackVolumes, planPovSliceQty, planVwapSlices, sliceCount, timeframeForSliceInterval } from './volume-plan.js';

const LOT = parseAmount('0.001');

function candle(openTimeMs: number, volume: string): Candle {
  const v = parseAmount(volume);
  return { openTimeMs, open: v, high: v, low: v, close: v, volume: v };
}

describe('timeframeForSliceInterval', () => {
  it('maps listed candle grains only — never invents a finer bucket', () => {
    expect(timeframeForSliceInterval(60_000)).toBe('1m');
    expect(timeframeForSliceInterval(3_600_000)).toBe('1h');
    expect(timeframeForSliceInterval(2_000)).toBeNull();
    expect(timeframeForSliceInterval(90_000)).toBeNull();
  });
});

describe('alignLookbackVolumes', () => {
  it('places observed volume on matching slot starts; missing slots stay 0 (no interpolate)', () => {
    const interval = 60_000;
    const end = 1_700_000_180_000;
    const n = 3;
    // slots: end-180s, end-120s, end-60s
    const candles = [candle(end - 180_000, '2'), candle(end - 60_000, '5')];
    expect(alignLookbackVolumes(candles, n, interval, end)).toEqual([parseAmount('2'), 0n, parseAmount('5')]);
  });
});

describe('planVwapSlices', () => {
  it('weights slices by observed volume; last absorbs remainder; lots snap', () => {
    const plan = planVwapSlices({
      totalQty: parseAmount('0.010'),
      volumes: [parseAmount('1'), parseAmount('3'), parseAmount('0')],
      lotSize: LOT,
    });
    // 1/4 of 0.010 = 0.0025 → lot 0.002; 3/4 = 0.0075 → 0.007; last remainder
    expect(plan.slices).toHaveLength(3);
    expect(plan.slices[0]).toBe(parseAmount('0.002'));
    expect(plan.slices[1]).toBe(parseAmount('0.007'));
    expect(plan.slices[2]).toBe(0n);
    expect(plan.plannedQty).toBe(parseAmount('0.009'));
    expect(plan.droppedQty).toBe(parseAmount('0.001'));
  });

  it('refuses all-zero lookback rather than falling back to equal TWAP slices', () => {
    expect(() =>
      planVwapSlices({
        totalQty: parseAmount('0.010'),
        volumes: [0n, 0n, 0n],
        lotSize: LOT,
      }),
    ).toThrow(TradeError);
    try {
      planVwapSlices({ totalQty: parseAmount('0.010'), volumes: [0n, 0n], lotSize: LOT });
    } catch (e) {
      expect(e).toBeInstanceOf(TradeError);
      expect((e as TradeError).code).toBe('trade.algo_volume_immature');
    }
  });
});

describe('planPovSliceQty', () => {
  it('sizes from observed interval volume × caller bps, never a default rate', () => {
    // 1.0 volume * 1000 bps = 0.10, cap remaining 0.05, lot 0.001 → 0.05
    expect(
      planPovSliceQty({
        intervalVolume: parseAmount('1'),
        participationBps: 1_000,
        remainingQty: parseAmount('0.05'),
        lotSize: LOT,
      }),
    ).toBe(parseAmount('0.05'));
  });

  it('zero observed volume → 0 qty (miss, do not invent participation)', () => {
    expect(
      planPovSliceQty({
        intervalVolume: 0n,
        participationBps: 1_000,
        remainingQty: parseAmount('1'),
        lotSize: LOT,
      }),
    ).toBe(0n);
  });

  it('refuses invented participation bps', () => {
    expect(() =>
      planPovSliceQty({
        intervalVolume: parseAmount('1'),
        participationBps: 0,
        remainingQty: parseAmount('1'),
        lotSize: LOT,
      }),
    ).toThrow(/participationBps/);
  });
});

describe('sliceCount', () => {
  it('matches TWAP N = floor(duration/interval)', () => {
    expect(sliceCount(10_000, 2_000)).toBe(5);
  });
});
