import { describe, expect, it, vi } from 'vitest';
import { startAlgoJobs } from './algo-jobs.js';

describe('startAlgoJobs', () => {
  it('disabled: host exists, no job scheduled, nothing ticks', async () => {
    const trade = { tickAllAlgos: vi.fn(async () => undefined) };
    const handle = startAlgoJobs({ trade, config: { enabled: false, intervalMs: 1_000 } });
    expect(handle.host.list()).toEqual([]);
    expect(trade.tickAllAlgos).not.toHaveBeenCalled();
    handle.stop();
  });

  it('enabled: registers one job and drives the engine on the interval', async () => {
    vi.useFakeTimers();
    try {
      const trade = { tickAllAlgos: vi.fn(async () => undefined) };
      const handle = startAlgoJobs({ trade, config: { enabled: true, intervalMs: 1_000 } });
      expect(handle.host.list()).toEqual(['algo.twap']);

      expect(trade.tickAllAlgos).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(trade.tickAllAlgos).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(trade.tickAllAlgos).toHaveBeenCalledTimes(3);

      handle.stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(trade.tickAllAlgos).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a throwing tick is reported and does not kill the schedule', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const trade = {
        tickAllAlgos: vi.fn(async () => {
          calls += 1;
          if (calls === 1) throw new Error('matching unreachable');
          return undefined;
        }),
      };
      const onError = vi.fn();
      const handle = startAlgoJobs({ trade, config: { enabled: true, intervalMs: 1_000 }, onError });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(onError).toHaveBeenCalledTimes(1);
      // The timer survives — a bad tick must not stop every future slice.
      await vi.advanceTimersByTimeAsync(1_000);
      expect(trade.tickAllAlgos).toHaveBeenCalledTimes(2);
      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
