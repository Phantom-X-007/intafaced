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
    // Box so TypeScript sees nested assignment (plain let T|null narrows to never at call site).
    const sleepGate: { release: (() => void) | null } = { release: null };
    const lifecycle = createBusLifecycle({
      log,
      initialBackoffMs: 1_000,
      sleep: () =>
        new Promise<void>((resolve) => {
          sleepGate.release = resolve;
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
    sleepGate.release?.();
    await stopPromise;

    // No further attempts after stop.
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(lifecycle.tradesBus()).toBe(false);
  });

  it('closes a late success that lands after stop', async () => {
    const attemptGate: { resolve: ((r: BusLifecycleConnectResult) => void) | null } = { resolve: null };
    const result = ok({ tradesUp: true, privateUp: true });
    const lifecycle = createBusLifecycle({
      log,
      attempt: () =>
        new Promise((resolve) => {
          attemptGate.resolve = resolve;
        }),
    });

    lifecycle.start();
    const stopPromise = lifecycle.stop();
    // Resolve attempt after stop was requested.
    attemptGate.resolve?.(result);
    await stopPromise;

    expect(result.close).toHaveBeenCalled();
    expect(lifecycle.tradesBus()).toBe(false);
    expect(lifecycle.privateBus()).toBe(false);
  });

  it('parks after first successful attach — does not re-attempt (nats.js owns mid-session)', async () => {
    let calls = 0;
    const first = ok({ tradesUp: true, privateUp: true });
    const lifecycle = createBusLifecycle({
      log,
      initialBackoffMs: 5,
      sleep: async () => undefined,
      attempt: async () => {
        calls += 1;
        return first;
      },
    });

    lifecycle.start();
    for (let i = 0; i < 20 && !lifecycle.tradesBus(); i += 1) {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
    }
    expect(lifecycle.tradesBus()).toBe(true);
    expect(calls).toBe(1);

    // Give the loop time to misbehave if it re-entered after success.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(calls).toBe(1);
    expect(lifecycle.tradesBus()).toBe(true);
    expect(lifecycle.privateBus()).toBe(true);

    await lifecycle.stop();
    expect(first.close).toHaveBeenCalled();
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
