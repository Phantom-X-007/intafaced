import type { HubLogger } from './depth/hub.js';

/**
 * NATS / JetStream lifecycle for the trade tape + private fan-out.
 *
 * Depth keeps serving whether the bus is up or not. When connect/subscribe
 * fails **before any successful attach** (boot or pre-success retries), we
 * retry with exponential backoff instead of leaving `tradesBus` / `privateBus`
 * false until process restart.
 *
 * Ownership split (do not blur these):
 * - **Before first attach:** this loop owns retry + `/ready` flags.
 * - **Tape up, private down:** this loop keeps the tape handle and retries
 *   only `retryPrivate` (do not reconnect, do not tear the public print).
 * - **After first full attach:** nats.js owns TCP reconnect for that connection.
 *   `tradesBus` / `privateBus` stay true while the consumer is attached for
 *   this process session. They are not a continuous liveness probe of the
 *   remote NATS server. A full mid-session supervisor (drop flags + re-attach
 *   when the connection is gone for good) is not built here — see README.
 */

export interface BusLifecycleConnectResult {
  /** Tear down bus + subscriptions on stop or before a retry. */
  readonly close: () => Promise<void>;
  /** Public tape consumer attached. */
  readonly tradesUp: boolean;
  /** Private order (and fill/position) consumers attached. */
  readonly privateUp: boolean;
  /**
   * When the tape is up but private is not, lifecycle calls this on backoff
   * instead of tearing the tape and reconnecting. Return true when all three
   * private consumers are attached. Omit when private is disabled (no JWT).
   */
  readonly retryPrivate?: () => Promise<boolean>;
}

export interface BusLifecycleOptions {
  /** One full connect+subscribe attempt. Throw or return closed state on fail. */
  readonly attempt: () => Promise<BusLifecycleConnectResult>;
  readonly log: HubLogger;
  /** First wait after a failed attempt (ms). */
  readonly initialBackoffMs?: number;
  /** Cap on backoff (ms). */
  readonly maxBackoffMs?: number;
  /** Injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface BusLifecycle {
  /** Non-blocking: first attempt + background retry until up or stopped. */
  start(): void;
  /** Cancel retries and close any live bus handle. */
  stop(): Promise<void>;
  readonly tradesBus: () => boolean;
  readonly privateBus: () => boolean;
}

const DEFAULT_INITIAL_MS = 1_000;
const DEFAULT_MAX_MS = 60_000;

export function createBusLifecycle(options: BusLifecycleOptions): BusLifecycle {
  const {
    attempt,
    log,
    initialBackoffMs = DEFAULT_INITIAL_MS,
    maxBackoffMs = DEFAULT_MAX_MS,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = options;

  let stopped = false;
  let loop: Promise<void> | null = null;
  let handle: BusLifecycleConnectResult | null = null;
  let tradesUp = false;
  let privateUp = false;

  function apply(result: BusLifecycleConnectResult | null): void {
    handle = result;
    tradesUp = result?.tradesUp === true;
    privateUp = result?.privateUp === true;
  }

  async function retryPrivateHalf(result: BusLifecycleConnectResult, startBackoff: number): Promise<void> {
    let backoff = startBackoff;
    while (!stopped) {
      await sleep(backoff);
      if (stopped) return;
      try {
        const up = await result.retryPrivate!();
        if (stopped) return;
        if (up) {
          apply({
            close: result.close,
            tradesUp: true,
            privateUp: true,
            retryPrivate: result.retryPrivate,
          });
          log.info({ tradesBus: true, privateBus: true }, 'svc-ws: private bus consumers attached after retry');
          return;
        }
      } catch (err) {
        if (stopped) return;
        log.warn(
          { err: String(err), backoffMs: backoff },
          'svc-ws: private bus still unavailable — trade tape still attached; retrying private half',
        );
      }
      backoff = Math.min(backoff * 2, maxBackoffMs);
    }
  }

  async function run(): Promise<void> {
    let backoff = initialBackoffMs;
    while (!stopped) {
      try {
        const result = await attempt();
        if (stopped) {
          await result.close().catch(() => undefined);
          apply(null);
          return;
        }
        apply(result);
        if (result.tradesUp && result.privateUp) {
          log.info({ tradesBus: true, privateBus: true }, 'svc-ws: bus consumers attached');
          // Stay parked on full success. nats.js owns mid-session reconnect.
          return;
        }
        if (result.tradesUp && result.retryPrivate) {
          // Tape is live. Keep retrying private only — do not close the tape.
          log.info(
            { tradesBus: true, privateBus: false },
            'svc-ws: bus consumers attached (private half still retrying)',
          );
          await retryPrivateHalf(result, backoff);
          return;
        }
        if (result.tradesUp || result.privateUp) {
          // Partial without a retry hook (JWT unset) — park like before.
          log.info({ tradesBus: result.tradesUp, privateBus: result.privateUp }, 'svc-ws: bus consumers attached');
          return;
        }
        // Connected but nothing subscribed — treat as fail and retry.
        await result.close().catch(() => undefined);
        apply(null);
      } catch (err) {
        apply(null);
        if (stopped) return;
        log.warn(
          { err: String(err), backoffMs: backoff },
          'svc-ws: trade/private bus unavailable — depth still serves; retrying with backoff',
        );
      }
      if (stopped) return;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, maxBackoffMs);
    }
  }

  return {
    start() {
      if (loop) return;
      stopped = false;
      loop = run();
    },
    async stop() {
      stopped = true;
      if (loop) {
        await loop.catch(() => undefined);
        loop = null;
      }
      if (handle) {
        await handle.close().catch(() => undefined);
        apply(null);
      }
    },
    tradesBus: () => tradesUp,
    privateBus: () => privateUp,
  };
}
