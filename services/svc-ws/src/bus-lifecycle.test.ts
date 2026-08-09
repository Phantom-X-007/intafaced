import { describe, expect, it, vi } from 'vitest';
import { createBusLifecycle, type BusLifecycleConnectResult } from './bus-lifecycle.js';

const log = { info: vi.fn(), warn: vi.fn() };

function ok(partial: Partial<BusLifecycleConnectResult> = {}): BusLifecycleConnectResult {
  return {
    close: vi.fn(async () => undefined),
    tradesUp: true,
    privateUp: false,
    ...partial,
  };
}

describe('bus lifecycle reconnect', () => {
  it('retries after boot failure and flips tradesBus true without a restart', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const first = ok({ tradesUp: true });
    const lifecycle = createBusLifecycle({
      log,
      initialBackoffMs: 10,
      maxBackoffMs: 40,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      attempt: async () => {
        calls += 1;
        if (calls < 3) throw new Error('nats down');
        return first;
      },
    });

    lifecycle.start();
    // Drain the async loop: fail, sleep, fail, sleep, success.
    for (let i = 0; i < 20 && !lifecycle.tradesBus(); i += 1) {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    }

    expect(calls).toBe(3);
    expect(lifecycle.tradesBus()).toBe(true);
    expect(lifecycle.privateBus()).toBe(false);
    expect(sleeps).toEqual([10, 20]); // exponential
    expect(log.warn).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalled();

    await lifecycle.stop();
    expect(first.close).toHaveBeenCalled();
    expect(lifecycle.tradesBus()).toBe(false);
  });

  it('does not retry forever after stop mid-backoff', async () => {
    let calls = 0;
    let releaseSleep: (() => void) | null = null;
    const lifecycle = createBusLifecycle({
      log,
      initialBackoffMs: 1_000,
      sleep: () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
      attempt: async () => {
        calls += 1;
        throw new Error('still down');
      },
    });

    lifecycle.start();
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);

    const stopPromise = lifecycle.stop();
    releaseSleep?.();
    await stopPromise;

    // No further attempts after stop.
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(lifecycle.tradesBus()).toBe(false);
  });

  it('closes a late success that lands after stop', async () => {
    let resolveAttempt: ((r: BusLifecycleConnectResult) => void) | null = null;
    const result = ok({ tradesUp: true, privateUp: true });
    const lifecycle = createBusLifecycle({
      log,
      attempt: () =>
        new Promise((resolve) => {
          resolveAttempt = resolve;
        }),
    });

    lifecycle.start();
    const stopPromise = lifecycle.stop();
    // Resolve attempt after stop was requested.
    resolveAttempt?.(result);
    await stopPromise;

    expect(result.close).toHaveBeenCalled();
    expect(lifecycle.tradesBus()).toBe(false);
    expect(lifecycle.privateBus()).toBe(false);
  });

  it('retries when attempt returns neither trades nor private up', async () => {
    let calls = 0;
    const empty = ok({ tradesUp: false, privateUp: false });
    const good = ok({ tradesUp: true, privateUp: true });
    const lifecycle = createBusLifecycle({
      log,
      initialBackoffMs: 5,
      sleep: async () => undefined,
      attempt: async () => {
        calls += 1;
        return calls === 1 ? empty : good;
      },
    });

    lifecycle.start();
    for (let i = 0; i < 20 && !lifecycle.tradesBus(); i += 1) {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    }

    expect(calls).toBe(2);
    expect(empty.close).toHaveBeenCalled();
    expect(lifecycle.tradesBus()).toBe(true);
    expect(lifecycle.privateBus()).toBe(true);
    await lifecycle.stop();
  });
});
