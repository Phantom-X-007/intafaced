/**
 * Directory list page size. Blank / non-finite / <1 refuses.
 * Never invent 50. Owner may pass 50 explicitly. Cap 1..200.
 *
 * OpsService maps stay the in-process book. Only the tRPC dump is paged.
 */

import { OpsError, type OpsRefuseCode } from './codes.js';

export const OPS_LIST_LIMIT_CAP = 200;

/** Owner-published directory list page size. Omit is not 50. */
export function assertOpsListLimit(limit: number | null | undefined, code: OpsRefuseCode): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new OpsError(code, 'pass limit (never invent 50)');
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new OpsError(code, 'pass limit (never invent 50)');
  }
  return Math.min(OPS_LIST_LIMIT_CAP, n);
}
