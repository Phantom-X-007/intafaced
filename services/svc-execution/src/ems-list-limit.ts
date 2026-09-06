/**
 * `execution.oms.ems.list` page size. Blank / non-finite / <1 refuses.
 * Never invent 50 or 100. Owner may pass 50 explicitly.
 *
 * Store.list stays a full journal for kill / TCA / /ready counts.
 * Only the tRPC dump is paged.
 */

export const EXECUTION_EMS_LIST_LIMIT_UNSET = 'execution.ems_list_limit_unset' as const;
export const EMS_LIST_LIMIT_CAP = 200;

export class EmsListLimitUnsetError extends Error {
  readonly code = EXECUTION_EMS_LIST_LIMIT_UNSET;
  constructor() {
    super('EMS list limit is unset — pass limit (never invent 50)');
    this.name = 'EmsListLimitUnsetError';
  }
}

/** Owner-published EMS list page size. Omit is not 50. */
export function assertEmsListLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new EmsListLimitUnsetError();
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new EmsListLimitUnsetError();
  }
  return Math.min(EMS_LIST_LIMIT_CAP, n);
}
