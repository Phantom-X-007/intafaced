/**
 * Public admin list page size (ems / unattended / orphaned).
 * Blank / non-finite / <1 refuses. Never invent 50 or 100.
 * Owner may pass 50 explicitly. Cap stays 200 — do not invent a new window.
 *
 * Store.list stays a full journal for kill / TCA / /ready counts.
 * Only the tRPC dump is paged.
 */

export const EXECUTION_EMS_LIST_LIMIT_UNSET = 'execution.ems_list_limit_unset' as const;
export const EXECUTION_UNATTENDED_LIST_LIMIT_UNSET = 'execution.unattended_list_limit_unset' as const;
export const EXECUTION_ORPHANED_LIST_LIMIT_UNSET = 'execution.orphaned_list_limit_unset' as const;
export const EMS_LIST_LIMIT_CAP = 200;

export class ExecutionListLimitUnsetError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ExecutionListLimitUnsetError';
    this.code = code;
  }
}

export class EmsListLimitUnsetError extends ExecutionListLimitUnsetError {
  constructor() {
    super(EXECUTION_EMS_LIST_LIMIT_UNSET, 'EMS list limit is unset — pass limit (never invent 50)');
    this.name = 'EmsListLimitUnsetError';
  }
}

export class UnattendedListLimitUnsetError extends ExecutionListLimitUnsetError {
  constructor() {
    super(EXECUTION_UNATTENDED_LIST_LIMIT_UNSET, 'unattended list limit is unset — pass limit (never invent 50)');
    this.name = 'UnattendedListLimitUnsetError';
  }
}

export class OrphanedListLimitUnsetError extends ExecutionListLimitUnsetError {
  constructor() {
    super(EXECUTION_ORPHANED_LIST_LIMIT_UNSET, 'orphaned list limit is unset — pass limit (never invent 50)');
    this.name = 'OrphanedListLimitUnsetError';
  }
}

function assertCappedListLimit(limit: number | null | undefined, ErrorClass: new () => ExecutionListLimitUnsetError): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new ErrorClass();
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new ErrorClass();
  }
  return Math.min(EMS_LIST_LIMIT_CAP, n);
}

/** Owner-published EMS list page size. Omit is not 50. */
export function assertEmsListLimit(limit: number | null | undefined): number {
  return assertCappedListLimit(limit, EmsListLimitUnsetError);
}

/** Owner-published unattended list page size. Omit is not 50. */
export function assertUnattendedListLimit(limit: number | null | undefined): number {
  return assertCappedListLimit(limit, UnattendedListLimitUnsetError);
}

/** Owner-published orphaned list page size. Omit is not 50. */
export function assertOrphanedListLimit(limit: number | null | undefined): number {
  return assertCappedListLimit(limit, OrphanedListLimitUnsetError);
}
