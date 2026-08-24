/**
 * connect.data-lake runtime capture on OMS snapshot polls (P-08).
 *
 * Records measured books and typed holes into fabric CaptureLake, then drains
 * to TSDB when owner env is complete. No invented retention — blank env stays
 * capture-log-only until shutdown flush attempt.
 */
import { CaptureLake, drainFabricCaptureLakeToPersistence } from '@intafaced/venue-adapter';
import { VenueUnavailableError } from '@intafaced/venue-contracts';
import type { OmsSnapshotFn } from './oms-market-snapshot.js';

export type CaptureLakeRuntimeEnv = {
  readonly CONNECT_DATA_LAKE_TSDB_URL?: string;
  readonly CONNECT_DATA_LAKE_RETENTION_DAYS?: string;
  readonly CONNECT_DATA_LAKE_DRAIN_INTERVAL_MS?: string;
};

export type CaptureLakeRuntime = {
  readonly wrapSnapshotMap: (map: Record<string, OmsSnapshotFn>) => Record<string, OmsSnapshotFn>;
  readonly drain: () => ReturnType<typeof drainFabricCaptureLakeToPersistence>;
  readonly start: () => void;
  readonly stop: () => Promise<void>;
};

function wrapOmsSnapshotWithCapture(lake: CaptureLake, venueId: string, snapshot: OmsSnapshotFn): OmsSnapshotFn {
  return async (symbol, limit) => {
    try {
      const snap = await snapshot(symbol, limit);
      lake.recordBook(snap);
      return snap;
    } catch (err) {
      if (err instanceof VenueUnavailableError) {
        lake.recordHole(venueId, symbol, err.reason, err.message);
      } else {
        lake.recordHole(venueId, symbol, 'capture_failed', err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  };
}

export function createCaptureLakeRuntime(env: CaptureLakeRuntimeEnv = process.env): CaptureLakeRuntime {
  const lake = new CaptureLake();
  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    wrapSnapshotMap(map) {
      const out: Record<string, OmsSnapshotFn> = {};
      for (const [venueId, fn] of Object.entries(map)) {
        out[venueId] = wrapOmsSnapshotWithCapture(lake, venueId, fn);
      }
      return out;
    },
    drain() {
      return drainFabricCaptureLakeToPersistence(lake, env);
    },
    start() {
      const raw = env.CONNECT_DATA_LAKE_DRAIN_INTERVAL_MS?.trim() ?? '';
      const ms = raw ? Number(raw) : NaN;
      if (!Number.isFinite(ms) || ms <= 0 || timer) return;
      timer = setInterval(() => {
        void drainFabricCaptureLakeToPersistence(lake, env);
      }, ms);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await drainFabricCaptureLakeToPersistence(lake, env);
    },
  };
}
