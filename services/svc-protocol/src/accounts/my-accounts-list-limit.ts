/**
 * `myAccounts` page size. Blank / non-finite / <1 refuses.
 * Never invent 50 or all.length. Owner may pass 50 explicitly.
 *
 * Cap matches the 1..200 window used on identity/execution public lists —
 * protocol has no other list product window.
 */

export const PROTOCOL_MY_ACCOUNTS_LIST_LIMIT_UNSET = 'protocol.my_accounts_list_limit_unset' as const;
export const MY_ACCOUNTS_LIST_LIMIT_CAP = 200;

export class MyAccountsListLimitUnsetError extends Error {
  readonly code = PROTOCOL_MY_ACCOUNTS_LIST_LIMIT_UNSET;
  constructor() {
    super('protocol.my_accounts_list_limit_unset: myAccounts list limit is unset — pass limit (never invent 50)');
    this.name = 'MyAccountsListLimitUnsetError';
  }
}

/** Owner-published myAccounts page size. Omit is not 50. */
export function assertMyAccountsListLimit(limit: unknown): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new MyAccountsListLimitUnsetError();
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new MyAccountsListLimitUnsetError();
  }
  return Math.min(MY_ACCOUNTS_LIST_LIMIT_CAP, n);
}
