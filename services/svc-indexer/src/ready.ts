import type { HaltState, SyncFailure } from './indexer.js';
import { lastErrorRefusesServing, lastErrorServingReason } from './serving.js';

/**
 * Readiness answer for a projection that may have halted or whose last pass
 * named a reason the book cannot be trusted as live.
 *
 * Extracted so tests can lock the contract without booting Fastify + Postgres:
 * a halted indexer leaves the rotation (503), a chain-door / startHeight lastError
 * does the same, a live one answers ready when the database check passes.
 * `/health` stays separate — liveness is "the process is up"; readiness is
 * "trust this book".
 */
export type ReadyAnswer =
  | { readonly httpStatus: 200; readonly body: { readonly ready: true } }
  | {
      readonly httpStatus: 503;
      readonly body: {
        readonly ready: false;
        readonly reason: string;
        readonly haltedAt?: string;
      };
    };

export function readinessOf(halted: HaltState | null, dbOk: boolean, dbError?: string, lastError?: SyncFailure | null): ReadyAnswer {
  if (halted) {
    return {
      httpStatus: 503,
      body: {
        ready: false,
        reason: halted.reason,
        haltedAt: halted.at.toISOString(),
      },
    };
  }
  if (lastErrorRefusesServing(lastError)) {
    return {
      httpStatus: 503,
      body: { ready: false, reason: lastErrorServingReason(lastError) },
    };
  }
  if (!dbOk) {
    return {
      httpStatus: 503,
      body: { ready: false, reason: dbError ?? 'database unreachable' },
    };
  }
  return { httpStatus: 200, body: { ready: true } };
}
