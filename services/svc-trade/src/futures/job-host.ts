/**
 * Futures job host skeleton (trade.futures residual).
 *
 * Wall-clock wrapper ONLY: runs injected tick callbacks on an interval.
 * Does NOT invent marks, rates, positions, or money. Callers pass fully
 * formed tick functions (e.g. () => runFundingTick(...)).
 *
 * Default: stopped. Ops enables intervals via env/config later.
 */
export interface JobHandle {
  /** Human name for logs. */
  name: string;
  stop(): void;
}

export interface JobHost {
  /** Schedule a tick. intervalMs must be > 0. */
  every(name: string, intervalMs: number, tick: () => void | Promise<void>): JobHandle;
  /** Stop all scheduled jobs. */
  stopAll(): void;
  /** Currently running job names. */
  list(): string[];
}

export function createJobHost(opts?: {
  /** Inject setInterval/clearInterval for tests. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  /** Called on tick rejection (never swallows invent). */
  onError?: (name: string, err: unknown) => void;
}): JobHost {
  const setI = opts?.setIntervalFn ?? setInterval;
  const clearI = opts?.clearIntervalFn ?? clearInterval;
  const onError = opts?.onError ?? ((name, err) => console.error(`[job-host] ${name}`, err));
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  return {
    every(name, intervalMs, tick) {
      if (!name.trim()) throw new Error('job name required');
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error('intervalMs must be > 0');
      if (timers.has(name)) throw new Error(`job already scheduled: ${name}`);

      let running = false;
      const id = setI(() => {
        if (running) return; // skip overlap — no invent backlog
        running = true;
        Promise.resolve()
          .then(() => tick())
          .catch((err) => onError(name, err))
          .finally(() => {
            running = false;
          });
      }, intervalMs);

      timers.set(name, id);
      return {
        name,
        stop() {
          const t = timers.get(name);
          if (t != null) {
            clearI(t);
            timers.delete(name);
          }
        },
      };
    },
    stopAll() {
      for (const [name, t] of timers) {
        clearI(t);
        timers.delete(name);
      }
    },
    list() {
      return [...timers.keys()];
    },
  };
}
