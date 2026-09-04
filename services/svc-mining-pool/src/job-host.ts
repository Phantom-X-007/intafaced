/** Wall-clock wrapper. Does not invent epochs, rewards, or money. */
export interface JobHandle {
  name: string;
  stop(): void;
}

export interface JobHost {
  every(name: string, intervalMs: number, tick: () => void | Promise<void>): JobHandle;
  stopAll(): void;
  list(): string[];
}

export function createJobHost(opts?: {
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
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
        if (running) return;
        running = true;
        return Promise.resolve()
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
